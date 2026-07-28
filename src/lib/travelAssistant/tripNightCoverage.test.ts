import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripCompleteness,
  buildTripNightCoverage,
  flightCoversNightAsAirborne,
  hotelCoversNight,
  shouldSkipPreDepartureHotelNag,
} from "@/lib/travelAssistant/tripNightCoverage";
import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";

const nowMs = Date.parse("2026-07-28T12:00:00Z");

test("hotel covers nights check-in inclusive, check-out exclusive", () => {
  const hotel = {
    id: "h1",
    type: "hotel",
    localTime: "2026-09-12 15:00",
    checkOutDate: "2026-09-15",
  };
  assert.equal(hotelCoversNight(hotel, "2026-09-12"), true);
  assert.equal(hotelCoversNight(hotel, "2026-09-14"), true);
  assert.equal(hotelCoversNight(hotel, "2026-09-15"), false);
});

test("overnight long-haul marks Sep 1 as airborne, not a hotel night", () => {
  const flight = {
    id: "as180",
    type: "flight",
    localTime: "2026-09-01 17:30",
    flightDate: "2026-09-01",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-02 11:15",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
  };
  assert.equal(flightCoversNightAsAirborne(flight, "2026-09-01"), true);
  assert.equal(flightCoversNightAsAirborne(flight, "2026-09-02"), false);
});

test("I34: Venice hotel does not hide Cortina/Ortisei nights Sep 15–17", () => {
  const coverage = buildTripNightCoverage({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-18",
    reservations: [
      {
        id: "as654",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "venice",
        type: "hotel",
        localTime: "2026-09-12 15:00",
        checkOutDate: "2026-09-15",
        location: "Venice",
        hotelSearchCity: "Venice",
      },
      {
        id: "train",
        type: "train",
        localTime: "2026-09-18 09:00",
        location: "Venice",
      },
    ],
  });

  const gapDates = coverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey);
  assert.ok(gapDates.includes("2026-09-15"));
  assert.ok(gapDates.includes("2026-09-16"));
  assert.ok(gapDates.includes("2026-09-17"));
  assert.ok(coverage.uncoveredRanges.some((r) => r.startNight <= "2026-09-15" && r.endNight >= "2026-09-17"));
});

test("I34: first outbound night-before is home-base — no nag", () => {
  assert.equal(
    shouldSkipPreDepartureHotelNag({
      flightDay: "2026-09-01",
      nightBeforeKey: "2026-08-31",
      flightDepartureAirport: "ONT",
      firstOutboundAirport: "ONT",
      firstOutboundFlightDay: "2026-09-01",
      reservations: [],
    }),
    true,
  );
});

test("detectTripGaps surfaces stay-gap for empty Cortina nights and skips home-base", () => {
  const gaps = detectTripGaps(
    [
      {
        id: "as654",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-01 12:00",
        location: "ONT",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-01 17:30",
        location: "SEA",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "az",
        type: "flight",
        provider: "ITA",
        localTime: "2026-09-02 15:35",
        location: "FCO",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2026-09-02 16:40",
      },
      {
        id: "venice",
        type: "hotel",
        provider: "Airbnb",
        localTime: "2026-09-12 15:00",
        location: "Venice",
        checkOutDate: "2026-09-15",
      },
    ],
    nowMs,
    {
      tripStartDate: "2026-09-01",
      tripEndDate: "2026-09-18",
    },
  );

  assert.equal(
    gaps.some((g) => g.id.startsWith("no-hotel-night-before-2026-08-31") || g.id.includes("2026-08-31")),
    false,
  );
  assert.equal(gaps.some((g) => g.id === "no-hotel-night-before-2026-09-01"), false);
  assert.ok(gaps.some((g) => g.id.startsWith("stay-gap-") && /need a stay/iu.test(g.title)));
});

test("trip completeness turns hotels orange when nights are missing", () => {
  const completeness = buildTripCompleteness({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-18",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:00",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-02 15:00",
        checkOutDate: "2026-09-10",
        location: "Monopoli",
      },
    ],
  });
  assert.equal(completeness.flights, "green");
  assert.equal(completeness.hotels, "orange");
  assert.equal(completeness.overall, "orange");
  assert.ok(completeness.firstHotelGap);
});
