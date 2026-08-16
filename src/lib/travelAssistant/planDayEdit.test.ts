import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dayActivityLinesEqual,
  planDayEditorTitle,
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
  assert.match(sheet, /\bDone\b/);
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
