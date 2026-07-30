import assert from "node:assert/strict";
import test from "node:test";
import {
  mustBlockStripeDigitalCheckout,
  resolveClientBillingPlatform,
} from "@/lib/billing/nativeBillingGate";

test("resolveClientBillingPlatform maps ios_native", () => {
  assert.equal(resolveClientBillingPlatform("ios_native"), "ios_native");
  assert.equal(resolveClientBillingPlatform("ios"), "ios_native");
  assert.equal(resolveClientBillingPlatform("web"), "web");
});

test("mustBlockStripeDigitalCheckout only for native iOS", () => {
  assert.equal(mustBlockStripeDigitalCheckout("ios_native"), true);
  assert.equal(mustBlockStripeDigitalCheckout("android_native"), false);
  assert.equal(mustBlockStripeDigitalCheckout("web"), false);
  assert.equal(mustBlockStripeDigitalCheckout("unknown"), false);
});
