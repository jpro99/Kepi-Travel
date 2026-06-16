import test from "node:test";
import assert from "node:assert/strict";
import { estimateAwardMiles, formatDateShiftLabel } from "./awardFlexEstimate";
import { shiftIsoDate } from "../providers/duffel/flexFlightSearch";

test("estimateAwardMiles varies by date but stays in realistic range", () => {
  const baseline = estimateAwardMiles({
    baseMiles: 70_000,
    origin: "SEA",
    destination: "FCO",
    departureDate: "2026-09-15",
  });
  const shifted = estimateAwardMiles({
    baseMiles: 70_000,
    origin: "SEA",
    destination: "FCO",
    departureDate: "2026-09-18",
  });
  assert.ok(baseline >= 55_000);
  assert.ok(shifted >= 55_000);
  assert.notEqual(baseline, shifted);
});

test("estimateAwardMiles is deterministic", () => {
  const input = {
    baseMiles: 70_000,
    origin: "SEA",
    destination: "FCO",
    departureDate: "2026-09-12",
  };
  assert.equal(estimateAwardMiles(input), estimateAwardMiles(input));
});

test("formatDateShiftLabel marks baseline and shifts", () => {
  assert.match(formatDateShiftLabel("2026-09-15", 0), /your date/);
  assert.match(formatDateShiftLabel("2026-09-18", 3), /\+3d/);
});

test("shiftIsoDate shifts forward", () => {
  assert.equal(shiftIsoDate("2026-09-15", 3), "2026-09-18");
});
