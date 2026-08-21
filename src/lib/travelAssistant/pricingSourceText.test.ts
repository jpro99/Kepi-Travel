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
    quotedPointsMiles: undefined as number | undefined,
    pointsProgram: undefined as string | undefined,
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

const ITA_BOILERPLATE_PDF = `
ITA Airways Electronic travel receipt
Reservation code Z84T4Z
--- PDF attachment ---
FARE DETAILS
Fare EUR 133.00
Total Amount EUR 149.78
Flight AZ1616 BRI FCO
`;

test("G34: selectPricingSourceText prefers PDF attachment for ITA fare totals", () => {
  const slice = selectPricingSourceText({
    originalEmailText: ITA_BOILERPLATE_PDF,
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1616",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
  });
  assert.match(slice, /PDF attachment/u);
  assert.match(slice, /Total Amount EUR 149.78/u);
  assert.equal(
    resolveReservationCashUsd({
      originalEmailText: ITA_BOILERPLATE_PDF,
      confirmationCode: "Z84T4Z",
    }),
    150,
  );
});

test("G37: selectPricingSourceText uses full email for Alaska New Ticket Value on any leg", () => {
  const alaskaEmail =
    "Confirmation DPNNWG\nNew Ticket Value: $1,386.43\nTotal charges USD $0\nAS489 SEA ONT";
  const slice = selectPricingSourceText({
    originalEmailText: alaskaEmail,
    confirmationCode: "DPNNWG",
    flightNumber: "AS489",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "ONT",
  });
  assert.match(slice, /New Ticket Value: \$1,386.43/u);
  assert.equal(
    resolveReservationCashUsd({
      originalEmailText: alaskaEmail,
      confirmationCode: "DPNNWG",
      flightNumber: "AS489",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "ONT",
    }),
    1386,
  );
});
