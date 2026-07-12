import assert from "node:assert/strict";
import test from "node:test";
import {
  countDraftDatesInTripWindow,
  detectFlightScheduleChange,
  expandTripWindowIfNeeded,
  inferTripWindowFromDrafts,
  pickBestMatchingTripForDrafts,
} from "@/lib/travelAssistant/tripEmailAttach";
import type { TravelTrip } from "@/lib/travelAssistant/tripStore";
import { reservationWithinTripWindow } from "@/lib/travelAssistant/tripWindow";

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
  assert.equal(reservationWithinTripWindow("2026-09-02", "2026-09-05", "2026-09-12"), true);
  assert.equal(reservationWithinTripWindow("2026-08-20", "2026-09-05", "2026-09-12"), false);
});
