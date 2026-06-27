import test from "node:test";
import assert from "node:assert/strict";
import { classifyStayStop, resolveStayIntent } from "./classifyStayStop";
import {
  deriveTripStaySegments,
  nextMissingStaySegment,
  segmentsAwaitingDecision,
} from "./deriveTripStaySegments";
import { mergeStayProfile, parseStayProfileText } from "./parseStayProfileText";
import { createEmptyHotelStayProfile } from "@/lib/memory/hotelStayProfile";

test("parseStayProfileText parses elevator and ocean preferences", () => {
  const patch = parseStayProfileText(
    "I need an elevator, no stairs with bags. Balcony near the ocean. Close to train station. Quality clean hotel.",
  );
  assert.equal(patch.requiresElevator, true);
  assert.equal(patch.avoidStairs, true);
  assert.equal(patch.prefersBalcony, true);
  assert.equal(patch.prefersOceanView, true);
  assert.equal(patch.prefersNearTransit, true);
  assert.equal(patch.qualityFloor, "high");
});

test("classifyStayStop treats same-day hub stops as connections", () => {
  const result = classifyStayStop({
    arrivalDay: "2027-06-10",
    nextDepartureDay: "2027-06-10",
    arrivalMs: Date.UTC(2027, 5, 10, 14, 0),
    nextDepartureMs: Date.UTC(2027, 5, 10, 18, 30),
    hasNextFlight: true,
  });
  assert.equal(result.stopKind, "connection");
  assert.equal(result.suggestedIntent, "skip");
});

test("deriveTripStaySegments skips Seattle same-day connection when user usually skips hubs", () => {
  const segments = deriveTripStaySegments({
    tripStartDate: "2027-06-10",
    tripEndDate: "2027-06-20",
    flights: [
      {
        id: "f1",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2027-06-10T14:00:00",
        flightDepartureAirport: "HND",
        flightDepartureTime: "2027-06-10T11:00:00",
      },
      {
        id: "f2",
        flightArrivalAirport: "HND",
        flightArrivalTime: "2027-06-11T16:00:00",
        flightDepartureAirport: "SEA",
        flightDepartureTime: "2027-06-10T18:00:00",
      },
      {
        id: "f3",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2027-06-12T10:00:00",
        flightDepartureAirport: "BRI",
        flightDepartureTime: "2027-06-18T09:00:00",
      },
    ],
    hotels: [],
    usuallySkipsConnections: true,
  });

  const seattle = segments.find((segment) => segment.city.toLowerCase().includes("seattle"));
  assert.ok(seattle);
  assert.equal(seattle?.nights, 0);
  assert.equal(seattle?.stopKind, "connection");
  assert.equal(seattle?.stayIntent, "skip");
  assert.notEqual(nextMissingStaySegment(segments)?.city.toLowerCase().includes("seattle"), true);
});

test("deriveTripStaySegments creates segments from flight arrivals", () => {
  const segments = deriveTripStaySegments({
    tripStartDate: "2027-06-10",
    tripEndDate: "2027-06-20",
    flights: [
      {
        id: "f1",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2027-06-10T14:00:00",
        flightDepartureAirport: "BRI",
        flightDepartureTime: "2027-06-15T09:00:00",
      },
      {
        id: "f2",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2027-06-15T12:00:00",
        flightDepartureAirport: "FCO",
        flightDepartureTime: "2027-06-20T10:00:00",
      },
    ],
    hotels: [],
  });

  assert.ok(segments.length >= 2);
  assert.equal(nextMissingStaySegment(segments)?.id, segments[0]?.id);
});

test("deriveTripStaySegments respects user skip decision", () => {
  const segments = deriveTripStaySegments({
    tripStartDate: "2027-06-10",
    tripEndDate: "2027-06-20",
    flights: [
      {
        id: "f1",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2027-06-10T14:00:00",
        flightDepartureAirport: "BRI",
        flightDepartureTime: "2027-06-15T09:00:00",
      },
    ],
    hotels: [],
    stayDecisions: { "flight-f1-0": "skip" },
  });

  assert.equal(segments[0]?.stayIntent, "skip");
  assert.equal(nextMissingStaySegment(segments), null);
});

test("resolveStayIntent auto-skips obvious connections when travel style learned", () => {
  const classification = classifyStayStop({
    arrivalDay: "2027-06-10",
    nextDepartureDay: "2027-06-10",
    arrivalMs: Date.UTC(2027, 5, 10, 14, 0),
    nextDepartureMs: Date.UTC(2027, 5, 10, 18, 0),
    hasNextFlight: true,
  });
  assert.equal(
    resolveStayIntent({
      classification,
      usuallySkipsConnections: true,
      isBooked: false,
    }),
    "skip",
  );
});

test("segmentsAwaitingDecision includes overnight layovers", () => {
  const segments = deriveTripStaySegments({
    flights: [
      {
        id: "f1",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2027-06-10T22:00:00",
        flightDepartureAirport: "HND",
      },
      {
        id: "f2",
        flightArrivalAirport: "HND",
        flightDepartureAirport: "SEA",
        flightDepartureTime: "2027-06-11T08:00:00",
      },
    ],
    hotels: [],
  });

  const overnight = segments.find((s) => s.stopKind === "overnight_layover");
  assert.ok(overnight);
  assert.equal(
    segmentsAwaitingDecision(segments).some((s) => s.id === overnight?.id),
    true,
  );
});

test("deriveTripStaySegments marks booked hotels", () => {
  const segments = deriveTripStaySegments({
    tripDestination: "Monopoli, Italy",
    tripStartDate: "2027-06-12",
    tripEndDate: "2027-06-18",
    flights: [],
    hotels: [
      {
        id: "h1",
        title: "Hyatt Centric Monopoli",
        location: "Monopoli, Italy",
        localTime: "2027-06-12T15:00:00",
        checkOutDate: "2027-06-18",
      },
    ],
  });

  assert.equal(segments[0]?.status, "booked");
  assert.equal(nextMissingStaySegment(segments), null);
});

test("mergeStayProfile keeps existing fields", () => {
  const base = createEmptyHotelStayProfile("user-1");
  const merged = mergeStayProfile(base, parseStayProfileText("Free breakfast and luxury hotels"));
  assert.equal(merged.prefersBreakfast, "required");
  assert.equal(merged.qualityFloor, "luxury");
  assert.equal(merged.completed, true);
});
