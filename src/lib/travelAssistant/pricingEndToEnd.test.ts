import test from "node:test";
import assert from "node:assert/strict";
import { rescanTripImports } from "@/lib/travelAssistant/rescanTripImports";
import { countRescannableReservations } from "@/lib/travelAssistant/rescanTripImportsShared";
import { computeTripSpend, buildTripSpendLineItems } from "@/lib/travelAssistant/tripSpendSummary";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import type { GmailApiClient } from "@/lib/travelAssistant/gmailImportProvider";

/** Alaska sends HTML with the fare in a table cell and no plain-text part. */
const ALASKA_RECEIPT_HTML = `<html><body>
<p>Confirmation code: DPNNWG</p>
<h2>Summary of airfare charges</h2>
<table>
  <tr><td>New Ticket Value:</td><td>$1,386.43</td></tr>
  <tr><td>Total charges for air travel:</td><td>USD $0.00</td></tr>
</table>
</body></html>`;

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_");
}

function gmailWithReceipt(): GmailApiClient {
  return {
    users: {
      messages: {
        async list({ q }: { q: string }) {
          return q.includes("DPNNWG") ? { data: { messages: [{ id: "m1" }] } } : { data: { messages: [] } };
        },
        async get() {
          return {
            data: {
              payload: {
                mimeType: "multipart/alternative",
                parts: [{ mimeType: "text/html", body: { data: base64Url(ALASKA_RECEIPT_HTML) } }],
              },
            },
          };
        },
      },
    },
  } as unknown as GmailApiClient;
}

/** Exactly Jeff's state: code known, four legs, nothing else stored. */
function unpricedDpnnwgTrip(): SessionReservation[] {
  const legs: Array<[string, string, string, string]> = [
    ["f1", "AS654", "ONT", "SEA"],
    ["f2", "AS180", "SEA", "FCO"],
    ["f3", "AS181", "FCO", "SEA"],
    ["f4", "AS489", "SEA", "ONT"],
  ];
  return legs.map(([id, flightNumber, from, to]) => ({
    id,
    type: "flight",
    title: `${from}-${to}`,
    provider: "Alaska Airlines",
    localTime: "2026-09-01T12:00",
    location: from,
    assignedTo: [],
    notes: "",
    confirmationCode: "DPNNWG",
    source: "imported",
    flightNumber,
    flightDepartureAirport: from,
    flightArrivalAirport: to,
  })) as unknown as SessionReservation[];
}

test("G41: bookings with only a confirmation code are still re-scannable", () => {
  const reservations = unpricedDpnnwgTrip();
  for (const leg of reservations) {
    assert.equal(leg.originalEmailText, undefined);
    assert.equal(leg.sourceEmailId, undefined);
  }
  // Old gating returned 0 here, which disabled the button and the auto-hunt.
  assert.equal(countRescannableReservations(reservations), 4);
});

test("G41: end-to-end re-scan prices all four DPNNWG legs with nothing stored", async () => {
  const reservations = unpricedDpnnwgTrip();

  const before = computeTripSpend(reservations);
  assert.equal(before.cashTotalUsd, 0);
  assert.equal(before.missingPriceCount, 1);

  const result = await rescanTripImports(reservations, {
    userId: "user-1",
    gmailClient: gmailWithReceipt(),
  });

  const after = computeTripSpend(result.reservations);
  assert.equal(after.cashTotalUsd, 1386);
  assert.equal(after.missingPriceCount, 0);
  assert.equal(result.reservations.every((leg) => leg.quotedPriceUsd === 1386), true);

  const ledger = buildTripSpendLineItems(result.reservations);
  const dpnnwg = ledger.filter((item) => item.confirmationCode === "DPNNWG");
  assert.equal(dpnnwg.length, 1);
  assert.equal(dpnnwg[0]?.needsPrice, false);
  assert.equal(dpnnwg[0]?.cashUsd, 1386);
  assert.equal(dpnnwg[0]?.groupSize, 4);
});

test("G41: re-scan explains itself when no receipt exists anywhere", async () => {
  const result = await rescanTripImports(unpricedDpnnwgTrip(), {
    userId: "user-1",
    gmailClient: {
      users: { messages: { async list() { return { data: { messages: [] } }; }, async get() { return { data: {} }; } } },
    } as unknown as GmailApiClient,
  });

  assert.equal(computeTripSpend(result.reservations).missingPriceCount, 1);
  const diagnostic = result.pricingDiagnostics?.find((item) => item.confirmationCode === "DPNNWG");
  assert.equal(diagnostic?.reason, "no-email-stored");
  assert.equal(diagnostic?.legCount, 4);
});
