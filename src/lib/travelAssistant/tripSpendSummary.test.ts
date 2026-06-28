import test from "node:test";
import assert from "node:assert/strict";
import {
  computeTripSpend,
  reservationHasAnyPrice,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";

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
