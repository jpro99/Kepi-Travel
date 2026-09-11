import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_PDF_ATTACHMENTS,
  BARI_VENICE_TRIP_ID,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  buildPassengerTicketSourceLinks,
  extractPassengerNameFromPdfFilename,
  passengerSlugFromName,
} from "@/lib/travelAssistant/railPassengerTicketLinks";

test("extractPassengerNameFromPdfFilename reads Trenitalia passenger PDF names", () => {
  assert.equal(extractPassengerNameFromPdfFilename("Stephanie-Russell-1980665325.pdf"), "Stephanie Russell");
  assert.equal(
    extractPassengerNameFromPdfFilename("Jeffery Paul-Russell-1980665325.pdf"),
    "Jeffery Paul Russell",
  );
});

test("buildPassengerTicketSourceLinks creates per-passenger source-view URLs", () => {
  const links = buildPassengerTicketSourceLinks({
    pdfAttachments: BARI_VENICE_PDF_ATTACHMENTS,
    tripId: BARI_VENICE_TRIP_ID,
    reservationId: "train-fa8312-lecce-bari",
  });
  assert.equal(links.length, 2);
  assert.match(links[0]?.label ?? "", /Stephanie/i);
  assert.match(links[1]?.label ?? "", /Jeffery/i);
  assert.match(links[0]?.url ?? "", /passenger=stephanie/i);
  assert.match(links[1]?.url ?? "", /passenger=jeffery/i);
  assert.equal(passengerSlugFromName("Jeffery Paul Russell"), "jeffery-paul-russell");
});
