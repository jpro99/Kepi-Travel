import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCashUsdFromText,
  resolveReservationCashUsd,
} from "@/lib/travelAssistant/parseReservationCashUsd";

test("parseCashUsdFromText prefers total over tax line", () => {
  const text = `
    Taxes and fees: $84.20
    Total amount: $1,247.50 USD
    Thank you for flying with us.
  `;
  assert.equal(parseCashUsdFromText(text), 1248);
});

test("parseCashUsdFromText handles Alaska-style totals", () => {
  const text = "Ticket Total USD 892.00 Confirmation AS 654";
  assert.equal(parseCashUsdFromText(text), 892);
});

test("resolveReservationCashUsd falls back to originalEmailText", () => {
  const usd = resolveReservationCashUsd({
    originalEmailText: "Grand Total: $456.78",
  });
  assert.equal(usd, 457);
});

test("resolveReservationCashUsd prefers stored quotedPriceUsd", () => {
  assert.equal(
    resolveReservationCashUsd({
      quotedPriceUsd: 200,
      originalEmailText: "Total: $999",
    }),
    200,
  );
});
