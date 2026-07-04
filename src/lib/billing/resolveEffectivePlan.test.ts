import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectivePlanStatus } from "@/lib/billing/resolveEffectivePlan";
import type { BillingSubscriptionRecord } from "@/lib/billing/subscriptionStore";

const FREE_RECORD: BillingSubscriptionRecord = {
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  validUntil: null,
  lifetimePlan: false,
  trialExpiresAt: null,
};

test("resolveEffectivePlanStatus honors lifetime mirror fallback", () => {
  const status = resolveEffectivePlanStatus(FREE_RECORD, Date.now(), true);
  assert.equal(status.plan, "lifetime");
  assert.equal(status.basePlan, "pro");
});

test("resolveEffectivePlanStatus honors active trial", () => {
  const status = resolveEffectivePlanStatus(
    {
      ...FREE_RECORD,
      plan: "pro",
      trialExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    Date.now(),
    false,
  );
  assert.equal(status.plan, "trial");
  assert.equal(status.basePlan, "pro");
});

test("resolveEffectivePlanStatus returns free without pro signals", () => {
  const status = resolveEffectivePlanStatus(FREE_RECORD, Date.now(), false);
  assert.equal(status.plan, "free");
  assert.equal(status.basePlan, "free");
});
