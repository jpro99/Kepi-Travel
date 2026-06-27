import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDayLine,
  parseDayLines,
  resolveStayCityForDay,
  serializeDayLines,
} from "./dayPlanLines";

test("parseDayLines splits on newlines and semicolons", () => {
  assert.deepEqual(parseDayLines("In Rome\nDinner at Roscioli"), ["In Rome", "Dinner at Roscioli"]);
  assert.equal(serializeDayLines(["A", "B"]), "A\nB");
});

test("classifyDayLine detects dining and travel", () => {
  assert.equal(classifyDayLine("Dinner at Roscioli").kind, "dining");
  assert.equal(classifyDayLine("Fly to Venice").kind, "travel");
});

test("resolveStayCityForDay uses stop ranges", () => {
  const city = resolveStayCityForDay("2026-09-05", {}, [
    { stop: { name: "Rome" }, checkIn: "2026-09-01", checkOut: "2026-09-06", nights: 5 },
  ]);
  assert.equal(city, "Rome");
});
