import test from "node:test";
import assert from "node:assert/strict";
import { selectPricingSourceText } from "@/lib/travelAssistant/pricingSourceText";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { applyAcceptedReservationPricing } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";

const UNITED_EMAIL = `
Confirmation Number EFLQKE
Flight 1 of 2 AZ1607 FCO-BRI
Flight 2 of 2 AZ437 MUC-FCO
Purchase Summary
Total 24,000 miles + 195.80 USD
MileagePlus
`;

test("selectPricingSourceText uses full email for award totals", () => {
  const slice = selectPricingSourceText({
    originalEmailText: UNITED_EMAIL,
    confirmationCode: "EFLQKE",
    flightNumber: "AZ1607",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "BRI",
  });
  assert.match(slice, /Purchase Summary/u);
  assert.match(slice, /24,000 miles \+ 195.80 USD/u);
});

test("G33: stale $12 quoted is corrected from email on applyAcceptedReservationPricing", () => {
  const priced = applyAcceptedReservationPricing({
    id: "f1",
    type: "flight",
    title: "FCO-BRI",
    confirmationCode: "EFLQKE",
    quotedPriceUsd: 12,
    originalEmailText: UNITED_EMAIL,
  });
  assert.equal(priced.quotedPriceUsd, 196);
  assert.equal(priced.quotedPointsMiles, 24000);
  assert.equal(priced.pointsProgram, "United MileagePlus");
});

test("G33: resolveReservationCashUsd reads award taxes from full email not leg slice", () => {
  assert.equal(
    resolveReservationCashUsd({
      originalEmailText: UNITED_EMAIL,
      confirmationCode: "EFLQKE",
      flightNumber: "AZ1607",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      quotedPriceUsd: 12,
    }),
    196,
  );
});
