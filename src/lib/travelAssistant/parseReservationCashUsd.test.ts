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

test("parseCashUsdFromText reads compact usd suffix without space", () => {
  assert.equal(parseCashUsdFromText("Room total 499usd for 2 nights"), 499);
  assert.equal(parseCashUsdFromText("You paid $842USD today"), 842);
  assert.equal(parseCashUsdFromText("Grand total: 1284.50usd"), 1285);
});

test("parseCashUsdFromText reads single New Ticket Value", () => {
  const text = "Summary of airfare charges New Ticket Value: $1,386.43 Total charges USD $0.00";
  assert.equal(parseCashUsdFromText(text), 1386);
});

test("resolveReservationCashUsd falls back to originalEmailText", () => {
  const usd = resolveReservationCashUsd({
    originalEmailText: "Grand Total: $456.78",
  });
  assert.equal(usd, 457);
});

test("parseCashUsdFromText reads totals from HTML confirmation bodies", () => {
  const html =
    "<div>Ticket summary</div><div>Grand Total:&nbsp;&#36;1,284.50</div><div>Taxes included</div>";
  assert.equal(parseCashUsdFromText(html), 1285);
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
