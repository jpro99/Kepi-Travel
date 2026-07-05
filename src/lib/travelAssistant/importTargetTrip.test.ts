import assert from "node:assert/strict";
import test from "node:test";
import { resolveImportTargetTrip } from "./importTargetTrip";
import type { ImportTargetTripRow } from "./importTargetTrip";

function trip(overrides: Partial<ImportTargetTripRow> & Pick<ImportTargetTripRow, "id" | "startDate" | "endDate">): ImportTargetTripRow {
  return {
    name: overrides.name ?? "Trip",
    destination: overrides.destination ?? "Honolulu",
    reservations: overrides.reservations ?? [],
    ...overrides,
  };
}

test("auto-picks when one trip matches all draft dates", () => {
    const winter = trip({
      id: "winter",
      name: "Aspen",
      destination: "Aspen",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
    });
    const summer = trip({
      id: "summer",
      name: "Hawaii",
      destination: "Honolulu",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
    });
    const result = resolveImportTargetTrip({
      trips: [winter, summer],
      draftDates: ["2026-09-02", "2026-09-08"],
      activeTripId: "winter",
      reservations: [
        { type: "flight", localTime: "2026-09-02 09:00" },
        { type: "flight", localTime: "2026-09-08 14:00" },
      ],
    });
  assert.equal(result.kind, "certain");
  if (result.kind === "certain") {
    assert.equal(result.tripId, "summer");
  }
});

test("asks user to choose when no trip matches dates", () => {
    const winter = trip({
      id: "winter",
      name: "Aspen",
      destination: "Aspen",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
    });
    const result = resolveImportTargetTrip({
      trips: [winter],
      draftDates: ["2026-09-02"],
      activeTripId: "winter",
      reservations: [{ type: "flight", localTime: "2026-09-02 09:00" }],
    });
  assert.equal(result.kind, "choose");
  if (result.kind === "choose") {
    assert.equal(result.reason, "no-match");
    assert.equal(result.candidates.length, 1);
  }
});

test("asks user to choose when multiple trips tie", () => {
    const first = trip({
      id: "a",
      name: "Europe",
      destination: "Paris",
      startDate: "2026-09-01",
      endDate: "2026-09-14",
    });
    const second = trip({
      id: "b",
      name: "Europe return",
      destination: "Rome",
      startDate: "2026-09-01",
      endDate: "2026-09-14",
    });
    const result = resolveImportTargetTrip({
      trips: [first, second],
      draftDates: ["2026-09-05"],
      activeTripId: "a",
      reservations: [{ type: "flight", localTime: "2026-09-05 09:00" }],
    });
  assert.equal(result.kind, "choose");
  if (result.kind === "choose") {
    assert.equal(result.reason, "multiple-match");
    assert.equal(result.candidates.length, 2);
  }
});
