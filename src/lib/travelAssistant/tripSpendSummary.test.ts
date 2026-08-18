import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripSpendLineItems,
  computeTripSpend,
  reservationHasAnyPrice,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import { parseCashUsdFromText } from "@/lib/travelAssistant/parseReservationCashUsd";

test("computeTripSpend sums cash and points for booked reservations", () => {
  const summary = computeTripSpend([
    { id: "f1", type: "flight", title: "JFK-SFO", quotedPriceUsd: 450 },
    { id: "h1", type: "hotel", title: "Hyatt", quotedPriceUsd: 890 },
    { id: "f2", type: "flight", title: "Award", quotedPointsMiles: 35000, pointsProgram: "United" },
  ]);
  assert.equal(summary.cashTotalUsd, 1340);
  assert.equal(summary.pointsTotal, 35000);
  assert.equal(summary.pricedCount, 3);
  assert.equal(summary.missingPriceCount, 0);
});

test("computeTripSpend skips planned legs and flags missing prices on booked items", () => {
  const summary = computeTripSpend([
    { id: "p1", type: "hotel", title: "Planned stay", plannedOnly: true },
    { id: "b1", type: "ride", title: "Uber to airport" },
    { id: "b2", type: "dinner", title: "Dinner", quotedPriceUsd: 120 },
  ]);
  assert.equal(summary.cashTotalUsd, 120);
  assert.equal(summary.missingPriceCount, 1);
  assert.deepEqual(summary.missingPriceIds, ["b1"]);
});

test("reservationHasAnyPrice treats points-only as priced", () => {
  const reservation = { id: "a1", type: "flight", title: "Award", quotedPointsMiles: 60000 };
  assert.equal(reservationHasAnyPrice(reservation), true);
  assert.equal(reservationMissingPrice(reservation), false);
});

test("reservationMissingPrice reads cash from notes when all reservations provided", () => {
  const reservations = [
    { id: "h1", type: "hotel", title: "Hyatt Rome", notes: "Grand total $499 USD" },
  ];
  assert.equal(reservationMissingPrice(reservations[0]!, reservations), false);
});

test("computeTripSpend reads total from forwarded email text once per confirmation", () => {
  const email = "Confirmation AS 654. Total amount: $892.00 USD. Thank you.";
  const summary = computeTripSpend([
    { id: "f1", type: "flight", title: "ONT-SEA", confirmationCode: "ABC123", originalEmailText: email },
    { id: "f2", type: "flight", title: "SEA-FCO", confirmationCode: "ABC123", originalEmailText: email },
  ]);
  assert.equal(summary.cashTotalUsd, 892);
  assert.equal(summary.missingPriceCount, 0);
});

test("computeTripSpend inherits email pricing from sibling leg with same confirmation", () => {
  const email =
    "New Ticket Value: $1,386.43\nNew Ticket Value: $1,386.43\nTotal charges for air travel: USD $0.00";
  const summary = computeTripSpend([
    {
      id: "f1",
      type: "flight",
      title: "SEA-ONT",
      confirmationCode: "AS123",
      originalEmailText: email,
    },
    {
      id: "f2",
      type: "flight",
      title: "ONT-SEA",
      confirmationCode: "AS123",
    },
  ]);
  assert.equal(summary.cashTotalUsd, 2773);
  assert.equal(summary.missingPriceCount, 0);
});

test("multi-leg flights share one confirmation price without per-leg breakdown", () => {
  const reservations = [
    {
      id: "f1",
      type: "flight",
      title: "ONT-SEA",
      confirmationCode: "ABC123",
      quotedPriceUsd: 8850,
    },
    { id: "f2", type: "flight", title: "SEA-FCO", confirmationCode: "ABC123" },
    { id: "f3", type: "flight", title: "FCO-ONT", confirmationCode: "ABC123" },
    { id: "h1", type: "hotel", title: "Monopoli", confirmationCode: "HOTEL1" },
  ];
  const summary = computeTripSpend(reservations);
  assert.equal(summary.cashTotalUsd, 8850);
  assert.equal(summary.missingPriceCount, 1);
  assert.deepEqual(summary.missingPriceIds, ["h1"]);
  assert.equal(reservationMissingPrice(reservations[1]!, reservations), false);
  assert.equal(reservationMissingPrice(reservations[2]!, reservations), false);
});

test("forwarded email legs share pricing via sourceEmailId without duplicate missing flags", () => {
  const email = "Confirmation ABC123. Total amount: $892.00 USD.";
  const reservations = [
    {
      id: "f1",
      type: "flight",
      title: "ONT-SEA",
      sourceEmailId: "email-1",
      originalEmailText: email,
    },
    {
      id: "f2",
      type: "flight",
      title: "SEA-FCO",
      sourceEmailId: "email-1",
    },
  ];
  const summary = computeTripSpend(reservations);
  assert.equal(summary.cashTotalUsd, 892);
  assert.equal(summary.missingPriceCount, 0);
});

test("I42: buildTripSpendLineItems lists needs-price first and Airbnb email cash", () => {
  const reservations = [
    {
      id: "h1",
      type: "hotel",
      title: "Cosy, Romantic & Stylish Studio",
      originalEmailText:
        "$245 per night. You will be charged a total of $736.44. Payment scheduled.",
    },
    { id: "r1", type: "ride", title: "Uber to airport" },
    { id: "f1", type: "flight", title: "SEA-FCO", quotedPriceUsd: 1200 },
  ];
  const items = buildTripSpendLineItems(reservations);
  assert.equal(items[0]?.id, "r1");
  assert.equal(items[0]?.needsPrice, true);
  const airbnb = items.find((i) => i.id === "h1");
  assert.equal(airbnb?.needsPrice, false);
  assert.equal(airbnb?.cashUsd, 736);
  assert.equal(items.find((i) => i.id === "f1")?.cashUsd, 1200);
});

test("G33: award miles and USD with 'and' separator", () => {
  assert.equal(parseCashUsdFromText("Total 24,000 miles and 195.80 USD"), 196);
});

test("G33: shared confirmation dedupes cash across legs with different email prefixes", () => {
  const emailA = "Confirmation EFLQKE leg A\nPurchase Summary\nTotal 24,000 miles + 195.80 USD";
  const emailB = "Flight AZ437 Confirmation EFLQKE\nPurchase Summary\nTotal 24,000 miles + 195.80 USD";
  const summary = computeTripSpend([
    { id: "f1", type: "flight", title: "FCO-BRI", confirmationCode: "EFLQKE", originalEmailText: emailA },
    { id: "f2", type: "flight", title: "MUC-FCO", confirmationCode: "EFLQKE", originalEmailText: emailB },
  ]);
  assert.equal(summary.cashTotalUsd, 196);
  assert.equal(summary.pointsTotal, 24000);
});
