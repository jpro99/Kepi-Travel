import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTravelerNotes } from "./sanitizeTravelerNotes";

test("strips Applied AI fallback jargon as a whole line", () => {
  const cleaned = sanitizeTravelerNotes(
    "• Arrive Bari\nApplied AI fallback extraction for low-confidence fields.\n• Dinner",
  );
  assert.equal(cleaned, "• Arrive Bari\n• Dinner");
});

test("strips Applied AI fallback jargon mid-string", () => {
  const cleaned = sanitizeTravelerNotes(
    "Confirmation ABC. Applied AI fallback extraction for low-confidence fields. Late check-in.",
  );
  assert.match(cleaned, /Confirmation ABC/);
  assert.match(cleaned, /Late check-in/);
  assert.doesNotMatch(cleaned, /Applied AI fallback/i);
});
