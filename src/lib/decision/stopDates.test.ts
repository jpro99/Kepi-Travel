import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent, RECORD_TRIP_EXAMPLE } from "./intentParser";
import { allocateStopDates } from "./stopDates";

test("allocateStopDates covers full trip length", () => {
  const intent = parseTripIntent(RECORD_TRIP_EXAMPLE, new Date("2026-06-01"));
  const ranges = allocateStopDates(intent);
  assert.ok(ranges.length >= 3);
  assert.equal(ranges[0]?.stop.name, "Bari");
  const total = ranges.reduce((sum, r) => sum + r.nights, 0);
  assert.ok(total >= intent.nights - 2 && total <= intent.nights + 2);
  assert.equal(ranges[0]?.checkIn, intent.startDate);
});
