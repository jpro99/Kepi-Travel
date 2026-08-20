import test from "node:test";
import assert from "node:assert/strict";
import { applyScannedDocumentPricing } from "@/lib/travelAssistant/scannedDocumentPricing";
import { computeTripSpend, buildTripSpendLineItems } from "@/lib/travelAssistant/tripSpendSummary";

/** What pdf-parse returns for an Alaska exchange receipt. */
const DROPPED_PDF_TEXT = `Alaska Airlines
Confirmation code: DPNNWG
Summary of airfare charges
Passenger 1: Jeffery Russell
New Ticket Value: $1,386.43
Additional Amount Due: $0.00
Total charges for air travel: USD $0.00
AS654 Ontario to Seattle
AS489 Seattle to Ontario`;

function unpricedLegs() {
  return [
    ["f1", "AS654", "ONT", "SEA"],
    ["f2", "AS180", "SEA", "FCO"],
    ["f3", "AS181", "FCO", "SEA"],
    ["f4", "AS489", "SEA", "ONT"],
  ].map(([id, flightNumber, from, to]) => ({
    id: id!,
    type: "flight",
    title: `${from}-${to}`,
    confirmationCode: "DPNNWG",
    flightNumber,
    flightDepartureAirport: from,
    flightArrivalAirport: to,
    quotedPriceUsd: undefined as number | undefined,
  }));
}

test("G42: dropping a PDF prices every leg of the matching PNR", () => {
  const reservations = unpricedLegs();
  assert.equal(computeTripSpend(reservations).missingPriceCount, 1);

  const result = applyScannedDocumentPricing(reservations, DROPPED_PDF_TEXT);

  assert.deepEqual(result.pricedCodes, ["DPNNWG"]);
  assert.equal(result.pricedLegCount, 4);
  assert.equal(result.reservations.every((leg) => leg.quotedPriceUsd === 1386), true);

  const summary = computeTripSpend(result.reservations);
  assert.equal(summary.cashTotalUsd, 1386);
  assert.equal(summary.missingPriceCount, 0);

  const ledger = buildTripSpendLineItems(result.reservations);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.cashUsd, 1386);
  assert.equal(ledger[0]?.needsPrice, false);
  assert.equal(ledger[0]?.groupSize, 4);
});

test("G42: a PDF for another booking never touches unrelated legs", () => {
  const reservations = unpricedLegs();
  const otherPdf = "Confirmation code: Z84T4Z\nTotal Amount EUR 149.78";

  const result = applyScannedDocumentPricing(reservations, otherPdf);

  assert.deepEqual(result.pricedCodes, []);
  assert.equal(result.reservations.every((leg) => leg.quotedPriceUsd === undefined), true);
});

test("G42: dropping the receipt does not duplicate legs", () => {
  const reservations = unpricedLegs();
  const result = applyScannedDocumentPricing(reservations, DROPPED_PDF_TEXT);
  assert.equal(result.reservations.length, 4);
  assert.deepEqual(
    result.reservations.map((leg) => leg.id),
    ["f1", "f2", "f3", "f4"],
  );
});
