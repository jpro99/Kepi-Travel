import test from "node:test";
import assert from "node:assert/strict";
import { parseCashUsdFromText, resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  parseMilesFromText,
  resolveReservationPricing,
} from "@/lib/travelAssistant/parseReservationMiles";

const ALASKA_EXCHANGE_EMAIL = `
Summary of airfare charges
Passenger 1: Jeffery Russell
Atmos Rewards Member: Atmos Gold # *****4372
New Ticket Value: $1,386.43
Additional Amount Due: $0.00
Per person total: $0.00
Passenger 2: Stephanie Russell
Atmos Rewards Member: Atmos Gold # *****5702
New Ticket Value: $1,386.43
Additional Amount Due: $0.00
Per person total: $0.00
Total charges for air travel: USD $0.00
Alaska 489 Seattle to Ontario
`;

test("parseCashUsdFromText sums Alaska New Ticket Value for multiple passengers", () => {
  assert.equal(parseCashUsdFromText(ALASKA_EXCHANGE_EMAIL), 2773);
});

test("parseCashUsdFromText ignores zero-dollar total due on exchanges", () => {
  const text = "Total charges for air travel: USD $0.00 New Ticket Value: $892.15";
  assert.equal(parseCashUsdFromText(text), 892);
});

test("parseMilesFromText detects Atmos Rewards program", () => {
  const parsed = parseMilesFromText(ALASKA_EXCHANGE_EMAIL);
  assert.equal(parsed.program, "Atmos Rewards");
});

test("resolveReservationCashUsd skips ticket value for miles-only award with zero due", () => {
  const text =
    "Award travel confirmation. You redeemed 60,000 miles. Total amount due: $0.00. New Ticket Value: $1,386.43";
  assert.equal(parseCashUsdFromText(text), undefined);
  assert.equal(
    resolveReservationCashUsd({
      originalEmailText: text,
    }),
    undefined,
  );
});

test("parseMilesFromText reads miles spent and earned when present", () => {
  const text = "You redeemed 22,500 miles. You will earn 1,250 bonus miles. Mileage Plan member.";
  const parsed = parseMilesFromText(text);
  assert.equal(parsed.milesSpent, 22500);
  assert.equal(parsed.milesEarned, 1250);
  assert.equal(parsed.program, "Alaska Mileage Plan");
});

test("resolveReservationPricing combines cash and miles from email body", () => {
  const pricing = resolveReservationPricing({
    originalEmailText: ALASKA_EXCHANGE_EMAIL,
  });
  assert.equal(pricing.cashUsd, 2773);
  assert.equal(pricing.program, "Atmos Rewards");
});
