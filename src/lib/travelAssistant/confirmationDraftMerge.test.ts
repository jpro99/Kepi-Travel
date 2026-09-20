import assert from "node:assert/strict";
import test from "node:test";
import { OBB_COMBINED_PDF_TEXT } from "@/lib/travelAssistant/fixtures/obbBolzanoMunichSep20Fixture";
import { mergeConfirmationDrafts } from "@/lib/travelAssistant/confirmationDraftMerge";
import { hasTravelConfirmationSignals } from "@/lib/travelAssistant/confirmationDocumentValidation";

test("I61: ÖBB PDF plain text passes travel confirmation validation", () => {
  assert.equal(hasTravelConfirmationSignals(OBB_COMBINED_PDF_TEXT), true);
});

test("I61: mergeConfirmationDrafts extracts ÖBB train without AI", () => {
  const drafts = mergeConfirmationDrafts([], OBB_COMBINED_PDF_TEXT, {
    referenceDate: new Date("2026-09-01T12:00:00Z"),
  });
  const train = drafts.find((draft) => draft.type === "train");
  assert.ok(train);
  assert.equal(train?.trainNumber, "86");
  assert.equal(train?.localTime, "2026-09-20 12:34");
  assert.match(train?.location ?? "", /Bolzano.*München/i);
  assert.equal(train?.trainSeat, "267/63,67,64,68");
});
