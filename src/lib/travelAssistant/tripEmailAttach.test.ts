import assert from "node:assert/strict";
import test from "node:test";
import {
  countDraftDatesInTripWindow,
  countDayPlanOverlapWithTrip,
  detectFlightScheduleChange,
  expandTripWindowIfNeeded,
  inferTripWindowFromDrafts,
  mergeFlightReservationUpdate,
  pickBestMatchingTripForDrafts,
  pickBestTripForDayPlan,
  pickRichestTripByReservations,
  remapDayKeyIntoTripWindow,
} from "@/lib/travelAssistant/tripEmailAttach";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { TravelTrip } from "@/lib/travelAssistant/tripStore";
import { computeTripSpend } from "@/lib/travelAssistant/tripSpendSummary";
import { reservationWithinTripWindow } from "@/lib/travelAssistant/tripWindow";

const DPNNWG_RECEIPT = `Summary of airfare charges
New Ticket Value: $1,386.43
Total charges for air travel: USD $0.00
Confirmation code: DPNNWG`;

function flightLeg(overrides: Partial<SessionReservation>): SessionReservation {
  return {
    id: "f1",
    type: "flight",
    title: "ONT-SEA",
    provider: "Alaska Airlines",
    localTime: "2026-09-01T12:00",
    location: "ONT",
    assignedTo: [],
    notes: "",
    confirmationCode: "DPNNWG",
    source: "imported",
    flightNumber: "AS654",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    ...overrides,
  } as SessionReservation;
}

test("G39: re-forwarded itinerary never erases a parsed ticket fare", () => {
  const existing = flightLeg({
    quotedPriceUsd: 1386,
    originalEmailText: DPNNWG_RECEIPT,
    sourceEmailId: "email-receipt",
  });
  const reforwardedItinerary = flightLeg({
    id: "f-new",
    quotedPriceUsd: undefined,
    sourceEmailId: "email-itinerary",
    originalEmailText:
      "Your trip AS654 ONT to SEA. Confirmation code: DPNNWG. Check in 24 hours before departure and arrive early for airport security screening.",
  });

  const merged = mergeFlightReservationUpdate(existing, reforwardedItinerary);
  assert.equal(merged.quotedPriceUsd, 1386);
  assert.match(merged.originalEmailText ?? "", /New Ticket Value/u);

  const summary = computeTripSpend([merged]);
  assert.equal(summary.cashTotalUsd, 1386);
  assert.equal(summary.missingPriceCount, 0);
});

function makeTrip(overrides: Partial<TravelTrip> & Pick<TravelTrip, "id" | "startDate" | "endDate">): TravelTrip {
  return {
    name: overrides.name ?? "Trip",
    destination: overrides.destination ?? "Honolulu",
    stage: "readiness",
    reservations: overrides.reservations ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("inferTripWindowFromDrafts infers trip window from flight drafts", () => {
  const inferred = inferTripWindowFromDrafts([
    { type: "flight", localTime: "2026-09-01 09:00", location: "IAH -> HNL" },
    { type: "flight", localTime: "2026-09-08 14:00", location: "HNL -> IAH" },
  ]);
  assert.equal(inferred.startDate, "2026-09-01");
  assert.equal(inferred.endDate, "2026-09-08");
  assert.ok(inferred.destination.includes("HNL"));
});

test("expandTripWindowIfNeeded expands trip window when reservation is outside configured dates", () => {
  const expanded = expandTripWindowIfNeeded(
    { startDate: "2026-09-01", endDate: "2026-09-05" },
    "2026-09-10",
  );
  assert.deepEqual(expanded, { startDate: "2026-09-01", endDate: "2026-09-10" });
});

test("detectFlightScheduleChange detects flight schedule changes", () => {
  const changes = detectFlightScheduleChange(
    {
      id: "1",
      type: "flight",
      title: "AS 832",
      provider: "Alaska",
      localTime: "2026-09-01 08:00",
      timezone: "UTC",
      location: "IAH-HNL",
      confirmationCode: "ABC",
      assignedTo: [],
      stage: "readiness",
      critical: true,
      confidence: "high",
      notes: "",
      source: "imported",
      flightDepartureTime: "2026-09-01 08:00",
      flightNumber: "AS832",
    },
    {
      id: "2",
      type: "flight",
      title: "AS 832",
      provider: "Alaska",
      localTime: "2026-09-01 10:30",
      timezone: "UTC",
      location: "IAH-HNL",
      confirmationCode: "ABC",
      assignedTo: [],
      stage: "readiness",
      critical: true,
      confidence: "high",
      notes: "",
      source: "imported",
      flightDepartureTime: "2026-09-01 10:30",
      flightNumber: "AS832",
    },
  );
  assert.ok(changes.includes("departure time"));
});

test("pickBestMatchingTripForDrafts picks the trip whose date window matches forwarded drafts", () => {
  const winterTrip = makeTrip({
    id: "winter",
    name: "Aspen ski trip",
    destination: "Aspen",
    startDate: "2026-12-20",
    endDate: "2026-12-27",
  });
  const summerTrip = makeTrip({
    id: "summer",
    name: "Hawaii summer",
    destination: "Honolulu",
    startDate: "2026-09-01",
    endDate: "2026-09-10",
  });
  const draftDates = ["2026-09-02", "2026-09-08"];

  assert.equal(countDraftDatesInTripWindow(draftDates, winterTrip), 0);
  assert.equal(countDraftDatesInTripWindow(draftDates, summerTrip), 2);

  const picked = pickBestMatchingTripForDrafts([winterTrip, summerTrip], draftDates, "winter");
  assert.equal(picked?.id, "summer");
});

test("pickBestMatchingTripForDrafts does not return a trip when no draft dates overlap", () => {
  const winterTrip = makeTrip({
    id: "winter",
    name: "Aspen ski trip",
    destination: "Aspen",
    startDate: "2026-12-20",
    endDate: "2026-12-27",
  });
  assert.equal(pickBestMatchingTripForDrafts([winterTrip], ["2026-09-02"], "winter"), null);
});

test("reservationWithinTripWindow allows reservations within padded window", () => {
  // Default pad is ±2 days from trip start/end.
  assert.equal(reservationWithinTripWindow("2026-09-03", "2026-09-05", "2026-09-12"), true);
  assert.equal(reservationWithinTripWindow("2026-09-02", "2026-09-05", "2026-09-12"), false);
  assert.equal(reservationWithinTripWindow("2026-08-20", "2026-09-05", "2026-09-12"), false);
});

test("pickRichestTripByReservations prefers the trip that still has bookings", () => {
  const emptyShell = makeTrip({
    id: "empty",
    startDate: "2026-09-02",
    endDate: "2026-09-12",
    reservations: [],
  });
  const europe = makeTrip({
    id: "europe",
    startDate: "2026-09-01",
    endDate: "2026-09-20",
    reservations: [{ id: "f1" }, { id: "h1" }] as TravelTrip["reservations"],
  });
  assert.equal(pickRichestTripByReservations([emptyShell, europe])?.id, "europe");
});

test("day-plan dates inside a trip window attach to that trip even with wrong year (I27)", () => {
  const emptyShell = makeTrip({
    id: "empty-2025",
    name: "Trip to Polignano a Mare",
    destination: "Polignano a Mare",
    startDate: "2025-09-02",
    endDate: "2025-09-12",
    reservations: [],
  });
  const europe = makeTrip({
    id: "europe-2026",
    name: "Europe 2026",
    destination: "Italy",
    startDate: "2026-09-01",
    endDate: "2026-09-25",
    reservations: [{ id: "f1" }, { id: "h1" }] as TravelTrip["reservations"],
  });
  const dayKeys = ["2025-09-02", "2025-09-05", "2025-09-12"];

  assert.equal(remapDayKeyIntoTripWindow("2025-09-02", europe.startDate, europe.endDate), "2026-09-02");
  assert.equal(countDayPlanOverlapWithTrip(dayKeys, europe), 3);
  assert.equal(countDayPlanOverlapWithTrip(dayKeys, emptyShell), 3);

  const picked = pickBestTripForDayPlan([emptyShell, europe], dayKeys, emptyShell.id);
  assert.equal(picked?.id, "europe-2026");
});
