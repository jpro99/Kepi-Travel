import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBestLocalTimeFromEmailBody,
  prepareEmailBodyForParsing,
  stripForwardEnvelopeHeaders,
} from "@/lib/travelAssistant/emailForwardParser";

const forwardedFlightEmail = `
---------- Forwarded message ---------
From: Jeff <jeff@example.com>
Date: Sat, 5 Jul 2026 10:23:00 -0700
Subject: Fwd: Your Alaska Airlines itinerary

---------- Forwarded message ---------
From: Alaska Airlines <no-reply@alaskaair.com>
Date: Mon, 2 Jun 2026 08:15:00 -0700
Subject: Your Alaska Airlines itinerary

Confirmation ABC123
Flight AS654
Departure: ONT Ontario
September 14, 2026
8:45 AM

Arrival: SEA Seattle
September 14, 2026
11:20 AM
`;

test("stripForwardEnvelopeHeaders removes forward Date metadata", () => {
  const stripped = stripForwardEnvelopeHeaders(forwardedFlightEmail);
  assert.match(stripped, /September 14, 2026/);
  assert.doesNotMatch(stripped, /Date: Sat, 5 Jul 2026/);
  assert.doesNotMatch(stripped, /Date: Mon, 2 Jun 2026/);
});

test("extractBestLocalTimeFromEmailBody uses departure date not purchase or forward date", () => {
  const localTime = extractBestLocalTimeFromEmailBody(forwardedFlightEmail, "flight");
  assert.equal(localTime, "2026-09-14 08:45");
});

test("prepareEmailBodyForParsing keeps itinerary content after forward stripping", () => {
  const prepared = prepareEmailBodyForParsing(forwardedFlightEmail);
  assert.match(prepared.collapsed, /AS654/);
  assert.match(prepared.lineAware, /Departure: ONT Ontario/);
});

test("purchase date is ignored when departure date is present", () => {
  const email = `
Purchased on June 2, 2026
Total paid: $412.00

Flight AZ1234
Departure FCO Rome
September 5, 2026 2:10 PM
Arrival BRI Bari
September 5, 2026 3:05 PM
`;
  const localTime = extractBestLocalTimeFromEmailBody(email, "flight");
  assert.equal(localTime, "2026-09-05 14:10");
});
