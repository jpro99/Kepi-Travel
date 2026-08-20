import test from "node:test";
import assert from "node:assert/strict";
import { sweepGmailForMissingPrices } from "@/lib/travelAssistant/gmailPricingSweep";
import { computeTripSpend } from "@/lib/travelAssistant/tripSpendSummary";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { GmailApiClient } from "@/lib/travelAssistant/gmailImportProvider";

const ALASKA_RECEIPT_HTML = `<html><body>
<h1>Summary of airfare charges</h1>
<p>Confirmation code: DPNNWG</p>
<table><tr><td>New Ticket Value:</td><td>$1,386.43</td></tr></table>
<p>Total charges for air travel: USD $0.00</p>
</body></html>`;

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_");
}

function fakeGmail(): GmailApiClient {
  return {
    users: {
      messages: {
        async list() {
          return { data: { messages: [{ id: "msg-receipt" }] } };
        },
        async get() {
          return {
            data: {
              payload: {
                mimeType: "multipart/alternative",
                parts: [
                  { mimeType: "text/plain", body: { data: base64Url("Alaska itinerary") } },
                  { mimeType: "text/html", body: { data: base64Url(ALASKA_RECEIPT_HTML) } },
                ],
              },
            },
          };
        },
      },
    },
  } as unknown as GmailApiClient;
}

function leg(id: string, title: string): SessionReservation {
  return {
    id,
    type: "flight",
    title,
    provider: "Alaska Airlines",
    localTime: "2026-09-01T12:00",
    location: "ONT",
    assignedTo: [],
    notes: "",
    confirmationCode: "DPNNWG",
    source: "imported",
  } as SessionReservation;
}

test("G40: Gmail sweep prices every leg of an unpriced PNR from an HTML receipt", async () => {
  const reservations = [
    leg("f1", "ONT-SEA"),
    leg("f2", "SEA-FCO"),
    leg("f3", "FCO-SEA"),
    leg("f4", "SEA-ONT"),
  ];

  const result = await sweepGmailForMissingPrices("user-1", reservations, fakeGmail());

  assert.deepEqual(result.codesRecovered, ["DPNNWG"]);
  assert.equal(result.reservations.every((r) => r.quotedPriceUsd === 1386), true);

  const summary = computeTripSpend(result.reservations);
  assert.equal(summary.cashTotalUsd, 1386);
  assert.equal(summary.missingPriceCount, 0);
});

test("G40: Gmail sweep reports when the mailbox is not connected", async () => {
  const result = await sweepGmailForMissingPrices("user-without-gmail", [leg("f1", "ONT-SEA")]);
  assert.equal(result.gmailAvailable, false);
  assert.deepEqual(result.codesSearched, ["DPNNWG"]);
});
