import type { BillingPlanId, BillingStatusPlan } from "@/lib/billing/plans";
import { CLERK_METADATA_LIFETIME_KEY, CLERK_METADATA_PLAN_KEY } from "@/lib/billing/clerkMetadataKeys";
import {
  getLifetimeMirrorStatus,
  getSubscriptionRecord,
  isSubscriptionActive,
  type BillingSubscriptionRecord,
} from "@/lib/billing/subscriptionStore";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface EffectivePlanStatus {
  plan: BillingStatusPlan;
  basePlan: BillingPlanId;
  lifetimePlanActive: boolean;
  trialActive: boolean;
  trialDaysRemaining: number | null;
  nextBillingDate: string | null;
}

export function resolveEffectivePlanStatus(
  subscriptionRecord: BillingSubscriptionRecord,
  nowMs: number,
  hasLifetimePlanFallback: boolean,
): EffectivePlanStatus {
  const lifetimePlanActive = subscriptionRecord.lifetimePlan || hasLifetimePlanFallback;
  if (lifetimePlanActive) {
    return {
      plan: "lifetime",
      basePlan: "pro",
      lifetimePlanActive: true,
      trialActive: false,
      trialDaysRemaining: null,
      nextBillingDate: null,
    };
  }

  const trialExpiresAt = subscriptionRecord.trialExpiresAt;
  const trialExpiresMs =
    typeof trialExpiresAt === "string" && trialExpiresAt.length > 0 ? Date.parse(trialExpiresAt) : Number.NaN;
  const trialActive = !Number.isNaN(trialExpiresMs) && trialExpiresMs > nowMs;
  if (trialActive) {
    return {
      plan: "trial",
      basePlan: "pro",
      lifetimePlanActive: false,
      trialActive: true,
      trialDaysRemaining: Math.max(1, Math.ceil((trialExpiresMs - nowMs) / DAY_IN_MS)),
      nextBillingDate: trialExpiresAt,
    };
  }

  if (isSubscriptionActive(subscriptionRecord)) {
    const paidPlan: BillingPlanId = subscriptionRecord.plan === "concierge" ? "concierge" : "pro";
    return {
      plan: paidPlan,
      basePlan: paidPlan,
      lifetimePlanActive: false,
      trialActive: false,
      trialDaysRemaining: null,
      nextBillingDate: subscriptionRecord.validUntil,
    };
  }

  return {
    plan: "free",
    basePlan: "free",
    lifetimePlanActive: false,
    trialActive: false,
    trialDaysRemaining: null,
    nextBillingDate: null,
  };
}

export async function getLifetimePlanFlagFromClerkMetadata(userId: string): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    return false;
  }
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const privatePlan = user.privateMetadata?.[CLERK_METADATA_PLAN_KEY];
    if (typeof privatePlan === "string" && privatePlan.trim().toLowerCase() === "lifetime") {
      return true;
    }
    const privateLifetimeFlag = user.privateMetadata?.[CLERK_METADATA_LIFETIME_KEY];
    if (typeof privateLifetimeFlag === "boolean") {
      return privateLifetimeFlag;
    }
    if (typeof privateLifetimeFlag === "string") {
      const normalized = privateLifetimeFlag.trim().toLowerCase();
      return normalized === "true" || normalized === "1" || normalized === "lifetime";
    }
    return false;
  } catch {
    return false;
  }
}

export async function resolveUserEffectivePlanStatus(userId: string): Promise<EffectivePlanStatus> {
  const [subscriptionRecord, lifetimeMirrorStatus, clerkMetadataHasLifetime] = await Promise.all([
    getSubscriptionRecord(userId),
    getLifetimeMirrorStatus(userId),
    getLifetimePlanFlagFromClerkMetadata(userId),
  ]);
  return resolveEffectivePlanStatus(
    subscriptionRecord,
    Date.now(),
    lifetimeMirrorStatus.hasLifetimeAccess || clerkMetadataHasLifetime,
  );
}
