import assert from "node:assert/strict";
import test from "node:test";
import { mergeConfirmationDrafts } from "./confirmationDraftMerge";
import { extractHotelDraftsFromDocumentText } from "./confirmationHotelExtract";
import { pickScanDraftForType, readTicketScanResponse } from "./confirmationScanClient";

const HOTEL_CONFIRMATION = `
Hyatt Centric Monopoli
Confirmation Number: HY123456

Check-in: Friday, September 4, 2026 at 3:00 PM
Check-out: Sunday, September 6, 2026

Location: Monopoli, Italy
Room type: King Deluxe
`;

test("extractHotelDraftsFromDocumentText parses hotel confirmation text", () => {
  const drafts = extractHotelDraftsFromDocumentText(HOTEL_CONFIRMATION);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "hotel");
  assert.match(drafts[0]?.title ?? "", /Hyatt Centric Monopoli/i);
  assert.equal(drafts[0]?.localTime, "2026-09-04 15:00");
  assert.equal(drafts[0]?.checkOutDate, "2026-09-06");
  assert.match(drafts[0]?.location ?? "", /Monopoli/i);
  assert.equal(drafts[0]?.confirmationCode, "HY123456");
});

const BOOKING_COM_NEREA = `
Booking.com confirmation
You're confirmed at NEREA Monopoli

Check-in
Friday, September 5, 2026
From 15:00

Check-out
Tuesday, September 8, 2026
Until 11:00

Confirmation number: 1234567890
`;

test("I35: Booking.com weekday checkout on next line parses for NEREA", () => {
  const drafts = extractHotelDraftsFromDocumentText(BOOKING_COM_NEREA);
  assert.equal(drafts.length, 1);
  assert.match(drafts[0]?.title ?? "", /NEREA/i);
  assert.equal(drafts[0]?.localTime.slice(0, 10), "2026-09-05");
  assert.equal(drafts[0]?.checkOutDate, "2026-09-08");
});

test("mergeConfirmationDrafts returns hotel drafts without AI", () => {
  const drafts = mergeConfirmationDrafts([], HOTEL_CONFIRMATION);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "hotel");
});

test("pickScanDraftForType prefers hotel when adding existing hotel", () => {
  const picked = pickScanDraftForType(
    [
      { type: "flight", title: "AS865" },
      { type: "hotel", title: "Hyatt Centric Monopoli" },
    ],
    "hotel",
  );
  assert.equal(picked?.type, "hotel");
});

test("readTicketScanResponse parses JSON errors safely", async () => {
  const response = new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  const parsed = await readTicketScanResponse(response);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.payload.error, "Unauthorized");
});

test("readTicketScanResponse handles HTML error bodies", async () => {
  const response = new Response("<html><body>Sign in</body></html>", {
    status: 502,
    headers: { "Content-Type": "text/html" },
  });
  const parsed = await readTicketScanResponse(response);
  assert.equal(parsed.ok, false);
  assert.match(parsed.payload.error ?? "", /unexpected response|502/i);
});
