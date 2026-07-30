import test from "node:test";
import assert from "node:assert/strict";
import {
  emailLooksLikeHistoricalArchive,
  evaluateHistoricalHotelForward,
  extractOriginalEmailSentAtMs,
} from "@/lib/travelAssistant/historicalEmailForward";

const SUMMER_IN_ITALY = `
---------- Forwarded message ---------
From: Luca - Summer In Italy <info@summerinitaly.com>
Date: Wed, Mar 14, 2018 at 10:40 AM
Subject: Thank you from Summer In Italy! [563348:819852]
To: jeff@example.com

Your reservation for Casa Capriccio is confirmed!
Dear Jeff, we have received your payment of EUR 452.00 for your reservation 339344 for Casa Capriccio.
`;

test("I45: extracts original Date: from forward envelope", () => {
  const ms = extractOriginalEmailSentAtMs(SUMMER_IN_ITALY);
  assert.ok(ms != null);
  assert.equal(new Date(ms!).getUTCFullYear(), 2018);
});

test("I45: 2018 payment-only hotel is archive + block auto-import", () => {
  const now = Date.parse("2026-07-30T12:00:00Z");
  const archive = emailLooksLikeHistoricalArchive(SUMMER_IN_ITALY, now);
  assert.equal(archive.archive, true);
  const gate = evaluateHistoricalHotelForward({
    type: "hotel",
    rawEmailText: SUMMER_IN_ITALY,
    localTime: "2027-03-14 15:00",
    nowMs: now,
  });
  assert.equal(gate.blockAutoImport, true);
  assert.equal(gate.clearInventedDates, true);
  assert.ok(gate.reasons.some((r) => /2018/i.test(r)));
});

test("I45: current-year Airbnb with check-in is not archive-blocked", () => {
  const text = `
Date: Tue, Aug 12, 2026 at 9:00 AM
Check-in
Sat, Sep 12
Check-out
Tue, Sep 15
`;
  const gate = evaluateHistoricalHotelForward({
    type: "hotel",
    rawEmailText: text,
    localTime: "2026-09-12 15:00",
    nowMs: Date.parse("2026-07-30T12:00:00Z"),
  });
  assert.equal(gate.blockAutoImport, false);
});
