import test from "node:test";
import assert from "node:assert/strict";
import { parseLiteApiCancellationPolicies, resolveHotelCancellationCopy } from "@/lib/hotels/hotelCancellation";

test("parseLiteApiCancellationPolicies handles non-refundable tag", () => {
  const summary = parseLiteApiCancellationPolicies({ refundableTag: "NRFN" });
  assert.equal(summary?.label, "Non-refundable");
  assert.equal(summary?.cancellable, false);
});

test("parseLiteApiCancellationPolicies handles free cancel deadline", () => {
  const summary = parseLiteApiCancellationPolicies({
    refundableTag: "RFN",
    cancelPolicyInfos: [{ cancelTime: "2026-09-10 14:00:00", amount: 0, currency: "USD" }],
  });
  assert.equal(summary?.label, "Free cancellation");
  assert.equal(summary?.cancellable, true);
});

test("resolveHotelCancellationCopy falls back to search hint", () => {
  const copy = resolveHotelCancellationCopy({ cancellable: true });
  assert.match(copy.detail, /confirm exact terms at checkout/i);
});
