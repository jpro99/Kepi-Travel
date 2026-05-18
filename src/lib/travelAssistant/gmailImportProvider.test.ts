import assert from "node:assert/strict";
import test from "node:test";
import {
  importGmailParsedReservations,
  parseEmailToParsedReservation,
} from "@/lib/travelAssistant/gmailImportProvider";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll(/=+$/g, "");
}

test("flight confirmation email parses to a flight reservation", () => {
  const parsed = parseEmailToParsedReservation({
    messageId: "flight-message",
    sender: "reservations@delta.com",
    subject: "Your upcoming flight DL 407 confirmation",
    receivedAt: "2026-06-20T10:42:00.000Z",
    body: [
      "Passenger: Alex Parker",
      "Flight: DL 407",
      "From: JFK Terminal 4",
      "To: SFO Terminal 2",
      "Departure: Jun 22 2026 08:15 AM EDT",
      "Confirmation: Y8Q4D2",
    ].join("\n"),
  });

  assert.equal(parsed.reservation.type, "flight");
  assert.equal(parsed.reservation.confirmationCode, "Y8Q4D2");
});

test("hotel booking email parses to a hotel reservation", () => {
  const parsed = parseEmailToParsedReservation({
    messageId: "hotel-message",
    sender: "bookings@hyatt.com",
    subject: "Hotel reservation itinerary confirmed",
    receivedAt: "2026-06-20T14:30:00.000Z",
    body: [
      "Hotel: Hyatt Regency",
      "Check-in: Jul 02 2026 03:00 PM PDT",
      "Reservation code: HYT55670",
      "Location: 245 Market St, San Francisco",
    ].join("\n"),
  });

  assert.equal(parsed.reservation.type, "hotel");
  assert.equal(parsed.reservation.confirmationCode, "HYT55670");
});

test("Gmail API failure returns empty array without throwing", async () => {
  const reservations = await importGmailParsedReservations({
    userId: "test-user",
    maxResults: 5,
    gmailClient: {
      users: {
        messages: {
          async list() {
            throw new Error("Gmail unavailable");
          },
          async get() {
            throw new Error("Should not be called");
          },
        },
      },
    },
  });
  assert.deepEqual(reservations, []);
});

test("imports and parses Gmail message fixtures", async () => {
  const messagesById = new Map([
    [
      "m1",
      {
        headers: [
          { name: "From", value: "reservations@delta.com" },
          { name: "Subject", value: "Flight ticket confirmation DL407" },
          { name: "Date", value: "2026-06-20T10:42:00.000Z" },
        ],
        body: base64UrlEncode("Flight DL 407\nFrom: JFK Terminal 4\nConfirmation: Y8Q4D2"),
      },
    ],
    [
      "m2",
      {
        headers: [
          { name: "From", value: "bookings@hyatt.com" },
          { name: "Subject", value: "Hotel booking confirmation" },
          { name: "Date", value: "2026-06-20T14:30:00.000Z" },
        ],
        body: base64UrlEncode("Hotel stay confirmed\nLocation: 245 Market St\nReservation: HYT55670"),
      },
    ],
  ]);

  const reservations = await importGmailParsedReservations({
    userId: "test-user",
    maxResults: 2,
    gmailClient: {
      users: {
        messages: {
          async list() {
            return {
              data: {
                messages: [{ id: "m1" }, { id: "m2" }],
              },
            };
          },
          async get(args) {
            const message = messagesById.get(args.id);
            if (!message) {
              throw new Error("Unknown message id");
            }
            return {
              data: {
                payload: {
                  headers: message.headers,
                  mimeType: "text/plain",
                  body: { data: message.body },
                },
              },
            };
          },
        },
      },
    },
  });

  assert.equal(reservations.length, 2);
  assert.equal(reservations[0]?.reservation.type, "flight");
  assert.equal(reservations[1]?.reservation.type, "hotel");
});
