import test from "node:test";
import assert from "node:assert/strict";
import { buildDayStayTimeline } from "./dayStayTimeline";
import { deriveStopRangesFromDayNotes } from "./dayNoteStopRanges";

test("timeline switches from Palermo to Monopoli without bleeding old city", () => {
  const notes = {
    "2026-09-01": "Stay in Palermo",
    "2026-09-04": "Leave Palermo, go to Monopoli",
    "2026-09-06": "In Monopoli",
  };
  const timeline = buildDayStayTimeline("2026-09-01", "2026-09-10", notes);
  assert.match(timeline.get("2026-09-03")?.stayCity ?? "", /Palermo/i);
  assert.match(timeline.get("2026-09-04")?.stayCity ?? "", /Monopoli/i);
  assert.match(timeline.get("2026-09-06")?.stayCity ?? "", /Monopoli/i);
  assert.equal(timeline.get("2026-09-06")?.stayCity?.includes("Palermo"), false);
});

test("leave Ortisei clears stay without inventing a return visit", () => {
  const notes = {
    "2026-09-18": "In Ortisei",
    "2026-09-20": "Leave Ortisei, go to Munich",
    "2026-09-21": "",
  };
  const timeline = buildDayStayTimeline("2026-09-18", "2026-09-22", notes);
  assert.match(timeline.get("2026-09-18")?.stayCity ?? "", /Ortisei/i);
  assert.match(timeline.get("2026-09-20")?.stayCity ?? "", /Munich/i);
  assert.equal(timeline.get("2026-09-21")?.stayCity?.includes("Ortisei"), false);
});

test("deriveStopRangesFromDayNotes ends Palermo when leaving for Monopoli", () => {
  const notes = {
    "2026-09-01": "In Palermo",
    "2026-09-04": "Leave Palermo, go to Monopoli",
    "2026-09-06": "In Monopoli",
  };
  const ranges = deriveStopRangesFromDayNotes("2026-09-01", "2026-09-10", notes);
  const palermo = ranges.find((row) => row.stop.name.toLowerCase().includes("palermo"));
  const monopoli = ranges.find((row) => row.stop.name.toLowerCase().includes("monopoli"));
  assert.equal(palermo?.checkOut, "2026-09-04");
  assert.equal(monopoli?.checkIn, "2026-09-04");
});
