import test from "node:test";
import assert from "node:assert/strict";
import { guestTotalForPlan, resolveGuestPriceQuote } from "@/lib/hotels/guestPricing";

test("member pays net rate", () => {
  const quote = resolveGuestPriceQuote(241, true);
  assert.equal(quote.memberTotalUsd, 241);
  assert.equal(quote.guestTotalUsd, 266.1);
  assert.equal(guestTotalForPlan(241, true), 241);
});

test("free user pays markup", () => {
  assert.equal(guestTotalForPlan(241, false), 266.1);
});
