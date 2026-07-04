import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBestLocalTimeFromEmailBody,
  extractFlightLegsFromEmailBody,
  parseForwardedEmail,
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

const fourLegItineraryEmail = `
---------- Forwarded message ---------
From: Jeff <jeff@example.com>
Date: Sat, 5 Jul 2026 10:23:00 -0700
Subject: Fwd: Your Alaska Airlines itinerary

Alaska Airlines itinerary
Confirmation ABC123

Flight AS654
Departure ONT Ontario
September 14, 2026
8:45 AM
Arrival SEA Seattle
September 14, 2026
11:20 AM

Flight AS832
Departure SEA Seattle
September 14, 2026
1:05 PM
Arrival HNL Honolulu
September 14, 2026
4:30 PM

Flight HA12
Departure HNL Honolulu
September 21, 2026
10:15 AM
Arrival HND Tokyo
September 22, 2026
2:40 PM

Flight HA11
Departure HND Tokyo
October 5, 2026
5:30 PM
Arrival HNL Honolulu
October 5, 2026
6:45 AM
`;

test("extractFlightLegsFromEmailBody finds every flight leg in a multi-segment itinerary", () => {
  const legs = extractFlightLegsFromEmailBody(fourLegItineraryEmail);
  assert.equal(legs.length, 4);
  assert.deepEqual(
    legs.map((leg) => leg.flightNumber).sort(),
    ["AS654", "AS832", "HA11", "HA12"],
  );
  assert.equal(legs.find((leg) => leg.flightNumber === "AS654")?.localTime, "2026-09-14 08:45");
  assert.equal(legs.find((leg) => leg.flightNumber === "AS832")?.localTime, "2026-09-14 13:05");
  assert.equal(legs.find((leg) => leg.flightNumber === "HA12")?.localTime, "2026-09-21 10:15");
  assert.equal(legs.find((leg) => leg.flightNumber === "HA11")?.localTime, "2026-10-05 17:30");
  assert.equal(legs.find((leg) => leg.flightNumber === "HA12")?.departureAirport, "HNL");
  assert.equal(legs.find((leg) => leg.flightNumber === "HA12")?.arrivalAirport, "HND");
});

test("parseForwardedEmail returns separate drafts for each flight leg without AI", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await parseForwardedEmail({
      subject: "Fwd: Your Alaska Airlines itinerary",
      from: "jeff@example.com",
      text: fourLegItineraryEmail,
      html: "",
      attachments: [],
    });
    assert.equal(result.drafts.length, 4);
    const flightNumbers = result.drafts.map((draft) => draft.flightNumber).sort();
    assert.deepEqual(flightNumbers, ["AS654", "AS832", "HA11", "HA12"]);
    assert.equal(
      result.drafts.find((draft) => draft.flightNumber === "AS654")?.localTime,
      "2026-09-14 08:45",
    );
    assert.equal(
      result.drafts.find((draft) => draft.flightNumber === "HA12")?.localTime,
      "2026-09-21 10:15",
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

const roundTripCompactEmail = `
Your trip confirmation ABC123

Outbound
AS654
ONT - SEA
September 14, 2026
8:45 AM

AS832
SEA - HNL
September 14, 2026
1:05 PM

HA12
HNL - HND
September 21, 2026
10:15 AM

Return flights
HA11
HND - HNL
October 5, 2026
5:30 PM

AS833
HNL - SEA
October 5, 2026
8:15 PM

AS655
SEA - ONT
October 6, 2026
6:40 AM
`;

test("extractFlightLegsFromEmailBody finds outbound and return flights without Flight prefix", () => {
  const legs = extractFlightLegsFromEmailBody(roundTripCompactEmail);
  assert.equal(legs.length, 6);
  assert.deepEqual(
    legs.map((leg) => leg.flightNumber).sort(),
    ["AS654", "AS655", "AS832", "AS833", "HA11", "HA12"],
  );
  assert.equal(legs.find((leg) => leg.flightNumber === "HA11")?.departureAirport, "HND");
  assert.equal(legs.find((leg) => leg.flightNumber === "AS655")?.arrivalAirport, "ONT");
});

test("parseForwardedEmail imports every leg on a round-trip itinerary without AI", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await parseForwardedEmail({
      subject: "Your trip confirmation",
      from: "no-reply@alaskaair.com",
      text: roundTripCompactEmail,
      html: "",
      attachments: [],
    });
    assert.equal(result.drafts.length, 6);
    assert.equal(result.drafts.find((draft) => draft.flightNumber === "AS655")?.localTime, "2026-10-06 06:40");
    assert.equal(result.drafts.find((draft) => draft.flightNumber === "HA11")?.localTime, "2026-10-05 17:30");
    assert.notEqual(result.drafts[0]?.confirmationCode, "YOUR");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("extractBestLocalTimeFromEmailBody reads Gmail abbreviated date with at time", () => {
  const email = `
Flight AS654
Departure ONT
Thu, Sep 14, 2026 at 8:45 AM
Arrival SEA
Thu, Sep 14, 2026 at 11:20 AM
`;
  const localTime = extractBestLocalTimeFromEmailBody(email, "flight");
  assert.equal(localTime, "2026-09-14 08:45");
});

test("html itinerary keeps line breaks for per-leg date parsing", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const html = `
      <p>Confirmation ABC123</p>
      <p>Flight AS654</p>
      <p>Departure ONT</p>
      <p>Sep 14, 2026 at 8:45 AM</p>
      <p>Flight AS832</p>
      <p>Departure SEA</p>
      <p>Sep 14, 2026 at 1:05 PM</p>
    `;
    const result = await parseForwardedEmail({
      subject: "Itinerary",
      from: "no-reply@alaskaair.com",
      text: "",
      html,
      attachments: [],
    });
    assert.equal(result.drafts.length, 2);
    assert.equal(result.drafts.find((draft) => draft.flightNumber === "AS654")?.localTime, "2026-09-14 08:45");
    assert.equal(result.drafts.find((draft) => draft.flightNumber === "AS832")?.localTime, "2026-09-14 13:05");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});
