import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDayLine,
  parseDayLines,
  parseDayLinesForEditor,
  resolveStayCityForDay,
  serializeDayLines,
  serializeDayLinesForEditor,
} from "./dayPlanLines";

test("parseDayLines splits on newlines and semicolons", () => {
  assert.deepEqual(parseDayLines("In Rome\nDinner at Roscioli"), ["In Rome", "Dinner at Roscioli"]);
  assert.equal(serializeDayLines(["A", "B"]), "A\nB");
});

test("editor serializers preserve spaces while typing", () => {
  assert.equal(serializeDayLinesForEditor(["Go to Munich"]), "Go to Munich");
  assert.equal(serializeDayLinesForEditor(["Stay in ", "Monopoli"]), "Stay in \nMonopoli");
  assert.deepEqual(parseDayLinesForEditor("Go to Munich"), ["Go to Munich"]);
  assert.equal(parseDayLinesForEditor("Go to Munich")[0], "Go to Munich");
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
