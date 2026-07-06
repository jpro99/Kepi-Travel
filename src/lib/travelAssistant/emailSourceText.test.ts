import test from "node:test";
import assert from "node:assert/strict";
import {
  appendPdfAttachmentText,
  ensurePdfInSourceText,
  mergePdfSectionIntoBody,
  shouldReplaceStoredSourceText,
  truncateEmailSourceText,
} from "@/lib/travelAssistant/emailSourceText";

test("mergePdfSectionIntoBody keeps PDF when HTML body is chosen", () => {
  const htmlBody = "<div>Flight FCO to BRE confirmed</div>";
  const rawWithPdf = `short plain text\n\n--- PDF attachment ---\n\nTotale EUR 86,40 AZ123 FCO BRE`;
  const merged = mergePdfSectionIntoBody(htmlBody, rawWithPdf);
  assert.match(merged, /--- PDF attachment ---/);
  assert.match(merged, /Totale EUR 86,40/);
});

test("ensurePdfInSourceText appends PDF when parser body omitted attachment section", () => {
  const stored = ensurePdfInSourceText("HTML itinerary only", "Totale EUR 86,40");
  assert.match(stored, /--- PDF attachment ---/);
  assert.match(stored, /Totale EUR 86,40/);
});

test("shouldReplaceStoredSourceText prefers fetched text when PDF marker is new", () => {
  assert.equal(
    shouldReplaceStoredSourceText("email body without prices", "email body\n\n--- PDF attachment ---\n\nEUR 86"),
    true,
  );
  assert.equal(shouldReplaceStoredSourceText("already has pdf\n\n--- PDF attachment ---\n\nold", "shorter"), false);
});

test("truncateEmailSourceText keeps PDF attachment when body is long", () => {
  const body = "x".repeat(13_000);
  const pdf = "--- PDF attachment ---\n\nTotale EUR 86,40";
  const stored = truncateEmailSourceText(`${body}\n\n${pdf}`, 12_000);
  assert.match(stored, /--- PDF attachment ---/);
  assert.match(stored, /Totale EUR 86,40/);
});

test("appendPdfAttachmentText does not duplicate marker", () => {
  const once = appendPdfAttachmentText("body", "pdf text");
  const twice = appendPdfAttachmentText(once, "pdf text");
  assert.equal(once, twice);
});
