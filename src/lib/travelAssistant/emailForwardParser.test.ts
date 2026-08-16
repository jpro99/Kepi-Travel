import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBestLocalTimeFromEmailBody,
  extractConfirmationCodeFromText,
  extractFlightLegsFromEmailBody,
  extractHotelPropertyName,
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

test("extractFlightLegsFromEmailBody parses at-time departure lines", () => {
  const body = `Confirmation ABC123
Flight AS654
Departure ONT
Sep 14, 2026 at 8:45 AM
Flight AS832
Departure SEA
Sep 14, 2026 at 1:05 PM`;
  const legs = extractFlightLegsFromEmailBody(body);
  assert.equal(legs.length, 2);
  assert.equal(legs.find((leg) => leg.flightNumber === "AS654")?.localTime, "2026-09-14 08:45");
  assert.equal(legs.find((leg) => leg.flightNumber === "AS832")?.localTime, "2026-09-14 13:05");
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

test("parseForwardedEmail prefers html body when plain text is only a stub", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const html = `
      <p>Confirmation ABC123</p>
      <p>Flight AS654</p><p>Departure ONT</p><p>Sep 14, 2026 at 8:45 AM</p>
      <p>Flight AS832</p><p>Departure SEA</p><p>Sep 14, 2026 at 1:05 PM</p>
      <p>Flight HA12</p><p>Departure HNL</p><p>Sep 21, 2026 at 10:15 AM</p>
    `;
    const result = await parseForwardedEmail({
      subject: "Itinerary",
      from: "no-reply@alaskaair.com",
      text: "Your trip confirmation ABC123",
      html,
      attachments: [],
    });
    assert.ok(result.drafts.length >= 3);
    assert.equal(result.drafts.find((draft) => draft.flightNumber === "HA12")?.localTime, "2026-09-21 10:15");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("extractFlightLegsFromEmailBody parses Bali-style PDF text with AZ and without Flight-of-N false positives", () => {
  const text = `
Flight 1 of 5
AS 865
Ontario, CA (ONT) to Seattle, WA (SEA)
Departure: Friday, September 12, 2025 at 6:00 AM

Flight 2 of 5
AS 6422 operated by ITA Airways
Seattle, WA (SEA) to Rome, Italy (FCO)
Departure: Friday, September 12, 2025 at 11:30 AM

Flight 3 of 5
AZ 1607
Bari, Italy (BRI) to Rome, Italy (FCO)
Departure: Friday, September 19, 2025 at 9:40 AM

Flight 4 of 5
SQ 948
Singapore (SIN) to Denpasar Bali (DPS)
Departure: Thursday, September 25, 2025 at 2:15 PM
`;
  const legs = extractFlightLegsFromEmailBody(text);
  const numbers = legs.map((leg) => leg.flightNumber.replace(/\s+/gu, ""));
  assert.equal(numbers.includes("OF5"), false);
  assert.ok(numbers.includes("AZ1607"));
  assert.ok(numbers.includes("AS6422"));
  const az = legs.find((leg) => leg.flightNumber.replace(/\s+/gu, "") === "AZ1607");
  assert.equal(az?.departureAirport, "BRI");
  assert.equal(az?.arrivalAirport, "FCO");
  const codeshare = legs.find((leg) => leg.flightNumber.replace(/\s+/gu, "") === "AS6422");
  assert.equal(codeshare?.departureAirport, "SEA");
  assert.equal(codeshare?.arrivalAirport, "FCO");
});

test("parseForwardedEmail classifies a boat excursion as dinner/activity, not ride", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const excursionEmail = `
Your reservation is confirmed!

Sunset Boat Excursion — Monopoli Coastline Tour
Confirmation: EXC-4471
Reservation for 4 guests
Saturday, September 19, 2026 at 5:30 PM
Meet at Monopoli Harbor
`;
    const result = await parseForwardedEmail({
      subject: "Booking confirmed: Sunset Boat Excursion",
      from: "no-reply@getyourguide.com",
      text: excursionEmail,
      html: "",
      attachments: [],
    });
    assert.equal(result.draft.type, "dinner");
    assert.notEqual(result.draft.type, "ride");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("extractHotelPropertyName reads You're confirmed at Casa de Elena (I25)", () => {
  const body = `
Booking.com confirmation
Confirmation number: 12345678283

You're confirmed at Casa de Elena
Check-in: Saturday, September 6, 2026
Check-out: Tuesday, September 9, 2026
`;
  assert.equal(extractHotelPropertyName("Booking.com confirmation 283", body), "Casa de Elena");
});

test("parseForwardedEmail prefers property name over Booking.com as title (I25)", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const body = `
Booking.com
Confirmation number: 12345678283

You're confirmed at Casa de Elena
Check-in: Saturday, September 6, 2026 from 15:00
Check-out: Tuesday, September 9, 2026 until 11:00
Polignano a Mare, Italy
`;
    const result = await parseForwardedEmail({
      subject: "Booking.com confirmation 283",
      from: "noreply@booking.com",
      text: body,
      html: "",
      attachments: [],
    });
    assert.equal(result.draft.type, "hotel");
    assert.equal(result.draft.title, "Casa de Elena");
    assert.match(result.draft.provider, /booking\.com/i);
    assert.notEqual(result.draft.title.toLowerCase(), "booking.com");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

const itaBoilerplateEmail = `
ITA Airways Electronic travel receipt
Dear Customer STEPHANIE RUSSELL, thank you for choosing ITA Airways services.
Please review this booking confirmation carefully as it includes some important and helpful information about your next trip.
Reservation code Z84T4Z
Your document(s) is/are: STEPHANIE RUSSELL: 055-4208939987 055-4208939989 055-2116012180
We encourage you to keep this email as confirmation of your reservation.
Effective March 15, 2016, Visa-exempt foreign nationals travelling to Canada by air must obtain a new entry requirement, known as an eTA.
Canadian authorities will not allow boarding on flights to Canada for passengers who have not obtained an eTA.
`;

test("extractConfirmationCodeFromText reads Codice prenotazione", () => {
  assert.equal(extractConfirmationCodeFromText("Codice prenotazione ABC12X\nLecce 13/09/2026"), "ABC12X");
});

test("I59: Booking GYGVN24XVY58 is not ERENCE from booking reference", () => {
  assert.equal(
    extractConfirmationCodeFromText("Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions"),
    "GYGVN24XVY58",
  );
  assert.equal(extractConfirmationCodeFromText("Please review this booking reference on the site"), null);
});

test("extractConfirmationCodeFromText prefers Reservation code over carefully", () => {
  assert.equal(extractConfirmationCodeFromText(itaBoilerplateEmail), "Z84T4Z");
  assert.equal(
    extractConfirmationCodeFromText("Please review this booking confirmation carefully as it includes"),
    null,
  );
});

test("ITA receipt boilerplate does not invent 2016 flight dates or CAREFULLY codes", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await parseForwardedEmail({
      subject: "Fwd: ITA Airways Electronic travel receipt",
      from: "jeff@gmail.com",
      text: itaBoilerplateEmail,
      html: "",
      attachments: [{ filename: "eticket.pdf", contentType: "application/pdf", size: 12000 }],
    });
    assert.equal(result.draft.confirmationCode, "Z84T4Z");
    assert.match(result.draft.provider, /ITA Airways/i);
    assert.doesNotMatch(result.draft.localTime, /^2016-/);
    assert.notEqual(result.draft.confirmationCode, "CAREFULLY");
    assert.notEqual(result.draft.provider.toLowerCase(), "gmail");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("I39: Airbnb yearless Venice stay parses check-in/out city — not payment date", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const body = `
Reservation confirmed
Cosy, Romantic & Stylish Studio
Entire home/apt hosted by Alessia
Check-in
Sat, Sep 12
After 3:00 PM
Checkout
Tue, Sep 15
By 10:00 AM
Address
Rio dei Miracoli, 30121 Venice, Veneto, Italy
Guests
2 adults
Scheduled payment
Aug 29, 2026
You will be charged a total of $736.44. Payment is scheduled for Aug 29, 2026 with Mastercard 8881.
`;
    const result = await parseForwardedEmail({
      subject: "Reservation confirmed - Cosy, Romantic & Stylish Studio",
      from: "noreply@airbnb.com",
      text: body,
      html: "",
      attachments: [],
    });
    assert.equal(result.draft.type, "hotel");
    assert.match(result.draft.title, /Cosy, Romantic/i);
    assert.match(result.draft.provider, /Airbnb/i);
    assert.equal(result.draft.localTime, "2026-09-12 15:00");
    assert.equal(result.draft.checkOutDate, "2026-09-15");
    assert.match(result.draft.location, /Venice/i);
    assert.doesNotMatch(result.draft.localTime, /^2026-08-29/);
    assert.equal(result.parsingStatus, "auto-parsed");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("parseForwardedEmail classifies a restaurant reservation as dinner, not ride", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const dinnerEmail = `
Your table is booked.

Locanda del Mare
Table for 2
Confirmation: LDM-2291
Friday, September 18, 2026 at 7:30 PM
`;
    const result = await parseForwardedEmail({
      subject: "Reservation confirmed at Locanda del Mare",
      from: "no-reply@opentable.com",
      text: dinnerEmail,
      html: "",
      attachments: [],
    });
    assert.equal(result.draft.type, "dinner");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("I58: Trenitalia 13/09/2026 is September 13 with Lecce → Venezia stations", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const ticket = `
TRENITALIA
BIGLIETTO DI VIAGGIO
Codice prenotazione ABC12X
PARTENZA
Lecce
13/09/2026 06:20
Binario 2
ARRIVO
Venezia S. Lucia
13/09/2026 14:42
Binario 9
`;
    const result = await parseForwardedEmail({
      subject: "Train tickets",
      from: "noreply@trenitalia.com",
      text: ticket,
      html: "",
      attachments: [],
    });
    assert.equal(result.draft.type, "train");
    assert.equal(result.draft.localTime, "2026-09-13 06:20");
    assert.equal(result.draft.location, "Lecce → Venezia S. Lucia");
    assert.equal(result.draft.confirmationCode, "ABC12X");
    assert.equal(result.draft.provider, "Trenitalia");
    assert.equal(result.draft.timezone, "Europe/Rome");
    assert.ok(result.confidenceScore > 40);
    assert.notEqual(result.parsingStatus, "needs-user-input");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("I59: GetYourGuide ticket-instructions PDF is a dinner booking, not a flight", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await parseForwardedEmail({
      subject: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
      from: "no-reply@getyourguide.com",
      text: `--- PDF attachment ---

Legal Notice
Privacy Policy
General Terms and Conditions
Version 1. Oct. 2025
Airline and flight changes are the carrier's responsibility.
`,
      html: "",
      attachments: [{ filename: "ticket-instructions.pdf", contentType: "application/pdf" }],
    });
    assert.equal(result.draft.type, "dinner");
    assert.equal(result.draft.confirmationCode, "GYGVN24XVY58");
    assert.equal(result.draft.provider, "GetYourGuide");
    assert.notEqual(result.draft.confirmationCode, "ERENCE");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }
  }
});

test("US 09/13/2026 stays September 13 for flights", () => {
  const localTime = extractBestLocalTimeFromEmailBody(
    "Flight AS654\nDeparture ONT\n09/13/2026 8:45 AM\nArrival SEA",
    "flight",
  );
  assert.equal(localTime, "2026-09-13 08:45");
});
