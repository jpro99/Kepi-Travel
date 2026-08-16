import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendPastedDayLines,
  dayActivityLinesEqual,
  insertPastedDayLines,
  moveDayActivityLine,
  planDayEditorTitle,
  preferDayActivityNote,
  splitPastedDayLines,
} from "./planDayEdit";

test("I51: paste splits Word-style lines into one-day bullets", () => {
  const lines = splitPastedDayLines(`
• Boat tour- 10 am GetYourGuide
Piazza Vittorio Emanuele II

  Chiesa Madre
`);
  assert.deepEqual(lines, [
    "Boat tour- 10 am GetYourGuide",
    "Piazza Vittorio Emanuele II",
    "Chiesa Madre",
  ]);
});

test("I51: Sept 2 editor title includes the city", () => {
  assert.equal(planDayEditorTitle("Sept 2", "Polignano a Mare"), "Sept 2 · Polignano a Mare");
  assert.equal(planDayEditorTitle("Sept 4: BEST VIEWPOINTS", "Polignano a Mare"), "Sept 4: BEST VIEWPOINTS · Polignano a Mare");
});

test("I51: empty Add does not count as a day change", () => {
  assert.equal(dayActivityLinesEqual(["Boat tour"], ["Boat tour", ""]), true);
  assert.equal(dayActivityLinesEqual(["Boat tour"], ["Boat tour", "Gelato"]), false);
});

test("I51: Plan day sheet is a full-screen Apple editor with Talk", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/travelAssistant/PlanDayEditSheet.tsx"), "utf8");
  assert.match(sheet, /100dvh/);
  assert.match(sheet, /"Talk"/);
  assert.match(sheet, /\bSave\b/);
  assert.match(sheet, /\bPaste\b/);
  assert.match(sheet, /Clear day/);
  assert.match(sheet, /webkitSpeechRecognition/);
  assert.doesNotMatch(sheet, /document\.body\.style\.overflow/);

  const letter = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  assert.match(letter, /PlanDayEditSheet/);
  assert.match(letter, /\bEdit\b/);
  assert.match(letter, /setEditingDateKey\(dateKey\)/);
});

test("I52: paste test one two three becomes a real day line", () => {
  const lines = insertPastedDayLines([""], 0, "test one two three");
  assert.deepEqual(splitPastedDayLines("test one two three"), ["test one two three"]);
  assert.equal(lines[0], "test one two three");
  assert.deepEqual(appendPastedDayLines(["Boat tour"], "test one two three\nGelato"), [
    "Boat tour",
    "test one two three",
    "Gelato",
    "",
  ]);
});

test("I52: drag reorder moves a line without dropping it", () => {
  assert.deepEqual(moveDayActivityLine(["Boat", "Gelato", "Church"], 2, 0), [
    "Church",
    "Boat",
    "Gelato",
  ]);
});

test("I52: Plan day sheet pastes, undoes, and reorders", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/travelAssistant/PlanDayEditSheet.tsx"), "utf8");
  assert.match(sheet, /clipboard\?\.readText/);
  assert.match(sheet, /onPaste/);
  assert.match(sheet, /\bUndo\b/);
  assert.match(sheet, /Move up/);
  assert.match(sheet, /Drag to reorder/);
  assert.match(sheet, /appendPastedDayLines\(lines, pasteText\)/);
  assert.doesNotMatch(sheet, /\[bullets\]/);

  const letter = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  assert.match(letter, /onPaste/);
  assert.match(letter, /setUndoDay/);

  const prefs = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/TripItineraryPanel.tsx"),
    "utf8",
  );
  assert.match(prefs, /notes: value/);
  assert.match(prefs, /queuePersistToTrip\(nextPlans, nextNotes\)/);
});

test("I53: saved plan notes beat a stale Stay-in Bari wrap", () => {
  assert.equal(
    preferDayActivityNote("• test one two three", "Stay in Bari\nHotel: Elena\nold boat tour"),
    "• test one two three",
  );
  assert.equal(preferDayActivityNote("", "• Boat tour"), "• Boat tour");
});

test("I53: Save always writes the day and returns to it", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/travelAssistant/PlanDayEditSheet.tsx"), "utf8");
  assert.match(sheet, />\s*Save\s*</);
  assert.match(sheet, /onSave\(withPaste\)/);
  assert.match(sheet, /window\.scrollTo/);
  assert.doesNotMatch(sheet, /if \(!dayActivityLinesEqual\(withPaste, bullets\)\)/);

  const letter = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  assert.match(letter, /commitBullets\(editingSection\.dateKey, next, true\)/);
  assert.match(letter, /scrollToDay\(dateKey\)/);
  assert.match(letter, /Saved on this day/);

  const prefs = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/TripItineraryPanel.tsx"),
    "utf8",
  );
  assert.match(prefs, /if \(next\[dateKey\]\?\.trim\(\)\) continue/);
  assert.doesNotMatch(prefs, /next\[dateKey\] = dayPlanToNote\(plan\)/);
});
