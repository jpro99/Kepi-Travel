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

test("G38: later itinerary forward does not overwrite a New Ticket Value receipt", () => {
  const receipt = "Confirmation DPNNWG\nNew Ticket Value: $1,386.43\nTotal charges USD $0.00";
  const longItinerary = `AS654 ONT-SEA AS180 SEA-FCO Confirmation DPNNWG ${"itinerary ".repeat(400)}`;
  assert.equal(shouldReplaceStoredSourceText(receipt, longItinerary), false);
  assert.equal(shouldReplaceStoredSourceText(longItinerary, receipt), true);
});

test("truncateEmailSourceText keeps New Ticket Value when body is long", () => {
  const body = `${"x".repeat(13_000)}\nNew Ticket Value: $1,386.43\nTotal charges USD $0.00`;
  const stored = truncateEmailSourceText(body, 12_000);
  assert.match(stored, /New Ticket Value: \$1,386\.43/);
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
