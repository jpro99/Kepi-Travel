import "server-only";

import type { BillingPlanId } from "@/lib/billing/plans";
import {
  getSubscriptionRecord,
  setSubscriptionRecord,
  type BillingSubscriptionRecord,
} from "@/lib/billing/subscriptionStore";
import { planFromRevenueCatEntitlements } from "@/lib/billing/revenueCatCatalog";
import { logger } from "@/lib/logger";

export type ApplyRevenueCatEntitlementsInput = {
  appUserId: string;
  entitlementIds: readonly string[];
  expirationAtMs?: number | null;
  eventType?: string;
  /** When true, force free even if entitlement list empty after EXPIRATION. */
  revokeIfEmpty?: boolean;
};

/**
 * Map RevenueCat entitlements onto Kepi subscription state.
 * Lifetime / Stripe-paid records are not clobbered by an empty RC payload unless revokeIfEmpty.
 */
export async function applyRevenueCatEntitlements(
  input: ApplyRevenueCatEntitlementsInput,
): Promise<BillingSubscriptionRecord> {
  const userId = input.appUserId.trim();
  if (!userId) {
    throw new Error("Missing RevenueCat app_user_id.");
  }

  const existing = await getSubscriptionRecord(userId);
  if (existing.lifetimePlan) {
    logger.info("Skipping RevenueCat apply — lifetime plan active.", {
      scope: "billing/applyRevenueCatEntitlements",
      userId,
    });
    return existing;
  }

  const nextPlan = planFromRevenueCatEntitlements(input.entitlementIds);
  const revoke = Boolean(input.revokeIfEmpty) || input.eventType === "EXPIRATION";

  if (nextPlan === "free" && !revoke) {
    // Non-expiration webhook without entitlements — keep current paid plan if any.
    if (existing.plan === "pro" || existing.plan === "concierge") {
      return existing;
    }
  }

  const validUntil =
    typeof input.expirationAtMs === "number" && Number.isFinite(input.expirationAtMs)
      ? new Date(input.expirationAtMs).toISOString()
      : nextPlan === "free"
        ? null
        : existing.validUntil;

  const plan: BillingPlanId = nextPlan === "free" ? "free" : nextPlan;
  const next: BillingSubscriptionRecord = {
    plan,
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: existing.stripeSubscriptionId,
    validUntil: plan === "free" ? null : validUntil,
    lifetimePlan: false,
    trialExpiresAt: null,
  };

  await setSubscriptionRecord(userId, next);
  logger.info("Applied RevenueCat entitlements to subscription.", {
    scope: "billing/applyRevenueCatEntitlements",
    userId,
    plan: next.plan,
    eventType: input.eventType ?? null,
    entitlementIds: input.entitlementIds,
  });
  return next;
}
