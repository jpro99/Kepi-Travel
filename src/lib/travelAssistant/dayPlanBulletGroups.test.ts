import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeDayPlanBullets,
  groupDayPlanBullets,
  isDayPlanDetailLine,
} from "@/lib/travelAssistant/dayPlanBulletGroups";
import { notesToBullets } from "@/lib/travelAssistant/narrativeItineraryExport";

test("I31: detail lines are hotel/booking fine print", () => {
  assert.equal(isDayPlanDetailLine("Address: 13 Vico Guididella, Polignano"), true);
  assert.equal(isDayPlanDetailLine("CHECK IN 16:00 - CHECK OUT 10:00"), true);
  assert.equal(isDayPlanDetailLine("Breakfast €10 per person"), true);
  assert.equal(isDayPlanDetailLine("Tourist tax not included"), true);
  assert.equal(isDayPlanDetailLine("Boat tour - 10 am GetYourGuide"), false);
  assert.equal(isDayPlanDetailLine("Explore Old town"), false);
});

test("I31: repeated activity block is collapsed to one copy", () => {
  const day3 = [
    "Boat tour - 10 am GetYourGuide",
    "Explore Old town",
    "Piazza Vittorio Emanuele II",
    "Chiesa Madre di S. Maria Assunta Church",
    "Boat tour - 10 am GetYourGuide",
    "Explore Old town",
    "Piazza Vittorio Emanuele II",
    "Chiesa Madre di S. Maria Assunta Church",
  ];
  assert.deepEqual(dedupeDayPlanBullets(day3), day3.slice(0, 4));
});

test("I31: consecutive duplicate lines are removed", () => {
  assert.deepEqual(
    dedupeDayPlanBullets([
      "Arrive Bari, travel to Polignano, explore old town",
      "Arrive Bari, travel to Polignano, explore old town",
    ]),
    ["Arrive Bari, travel to Polignano, explore old town"],
  );
});

test("I31: hotel fine print groups under stay headline", () => {
  const groups = groupDayPlanBullets([
    "Land and stay in Polignano a Mare — A Casa di Elena",
    "Address: 13 Vico Guididella, 70044 Polignano a Mare, Italy",
    "CHECK IN 16:00 - CHECK OUT 10:00",
    "Late check-in (available upon prior agreement)",
    "Breakfast €10 per person — Mediterranean style",
    "Tourist tax to be paid on site",
    "Arrive Bari, travel to Polignano, explore old town, Lama Monachile viewpoint, sunset, dinner.",
  ]);
  assert.equal(groups.length, 2);
  assert.match(groups[0]!.title, /A Casa di Elena|Polignano/iu);
  assert.equal(groups[0]!.details.length, 5);
  assert.match(groups[1]!.title, /Arrive Bari/iu);
  assert.equal(groups[1]!.details.length, 0);
});

test("I31: notesToBullets dedupes before Timeline/PDF render", () => {
  const notes = [
    "• Boat tour - 10 am GetYourGuide",
    "• Explore Old town",
    "• Boat tour - 10 am GetYourGuide",
    "• Explore Old town",
  ].join("\n");
  assert.deepEqual(notesToBullets(notes), [
    "Boat tour - 10 am GetYourGuide",
    "Explore Old town",
  ]);
});
