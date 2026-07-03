import test from "node:test";
import assert from "node:assert/strict";
import {
  citiesSame,
  deriveStopRangesFromDayNotes,
  extractExplicitStayWindows,
  mergeStopRanges,
  pickPrimaryStayPerCity,
  resolveEffectiveStopRanges,
} from "./dayNoteStopRanges";

test("citiesSame treats Polignano spelling variants as the same city", () => {
  assert.equal(citiesSame("Polignano a Mare", "Polignano Amar"), true);
});

test("extractExplicitStayWindows parses arrive 2nd leave 5th into one stay block", () => {
  const notes = {
    "2026-09-01": "Polignano a Mare — get there on the 2nd, leave on the 5th",
  };
  const ranges = extractExplicitStayWindows("2026-09-01", "2026-09-25", notes);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]?.checkIn, "2026-09-02");
  assert.equal(ranges[0]?.checkOut, "2026-09-05");
  assert.match(ranges[0]?.stop.name.toLowerCase() ?? "", /polignano/);
});

test("mergeStopRanges merges fragmented same-city ranges", () => {
  const merged = mergeStopRanges([
    { stop: { name: "Polignano a Mare" }, checkIn: "2026-09-02", checkOut: "2026-09-04", nights: 2 },
    { stop: { name: "Polignano Amar" }, checkIn: "2026-09-06", checkOut: "2026-09-08", nights: 2 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.checkIn, "2026-09-02");
  assert.equal(merged[0]?.checkOut, "2026-09-08");
});

test("resolveEffectiveStopRanges prefers talk-to-plan intent over fragmented day notes", () => {
  const intentRanges = [
    {
      stop: { name: "Polignano a Mare" },
      checkIn: "2026-09-02",
      checkOut: "2026-09-05",
      nights: 3,
    },
    {
      stop: { name: "Monopoli, Italy" },
      checkIn: "2026-09-05",
      checkOut: "2026-09-08",
      nights: 3,
    },
  ];
  const notes = {
    "2026-09-02": "In Polignano",
    "2026-09-06": "Polignano Amar",
    "2026-09-09": "Polignano a Mare",
    "2026-09-13": "Polignano",
  };
  const effective = resolveEffectiveStopRanges(intentRanges, "2026-09-01", "2026-09-25", notes);
  assert.equal(effective.length, 2);
  assert.equal(effective[0]?.checkIn, "2026-09-02");
  assert.equal(effective[0]?.checkOut, "2026-09-05");
});

test("resolveEffectiveStopRanges uses explicit arrive/leave note over intent", () => {
  const intentRanges = [
    { stop: { name: "Bari" }, checkIn: "2026-09-01", checkOut: "2026-09-10", nights: 9 },
  ];
  const notes = {
    "2026-09-01": "Polignano a Mare, arrive 2nd leave 5th",
  };
  const effective = resolveEffectiveStopRanges(intentRanges, "2026-09-01", "2026-09-25", notes);
  assert.equal(effective.length, 1);
  assert.equal(effective[0]?.checkIn, "2026-09-02");
  assert.equal(effective[0]?.checkOut, "2026-09-05");
});

test("pickPrimaryStayPerCity keeps one block per city with the longest stay", () => {
  const picked = pickPrimaryStayPerCity([
    { stop: { name: "Polignano a Mare" }, checkIn: "2026-09-01", checkOut: "2026-09-05", nights: 4 },
    { stop: { name: "Monopoli, Italy" }, checkIn: "2026-09-05", checkOut: "2026-09-06", nights: 1 },
    { stop: { name: "Polignano Amar" }, checkIn: "2026-09-06", checkOut: "2026-09-08", nights: 2 },
    { stop: { name: "Polignano a Mare" }, checkIn: "2026-09-09", checkOut: "2026-09-12", nights: 3 },
    { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-13", nights: 1 },
  ]);
  assert.equal(picked.length, 3);
  const polignano = picked.find((row) => row.stop.name.toLowerCase().includes("polignano"));
  assert.equal(polignano?.checkIn, "2026-09-01");
  assert.equal(polignano?.checkOut, "2026-09-05");
  assert.equal(polignano?.nights, 4);
});

test("deriveStopRangesFromDayNotes builds one continuous range when city is consistent", () => {
  const notes: Record<string, string> = {
    "2026-09-02": "Arrive in Polignano a Mare",
    "2026-09-03": "In Polignano a Mare",
    "2026-09-04": "In Polignano a Mare",
    "2026-09-05": "Leave Polignano a Mare",
  };
  const ranges = deriveStopRangesFromDayNotes("2026-09-01", "2026-09-10", notes);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]?.checkIn, "2026-09-02");
});
