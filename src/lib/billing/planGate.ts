import type { BillingPlanId, PlanFeature } from "@/lib/billing/plans";
import { PRO_PLAN } from "@/lib/billing/plans";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";

const PRO_FEATURE_SET = new Set<PlanFeature>(PRO_PLAN.enabledFeatures);

export function requiresPro(feature: PlanFeature): boolean {
  return PRO_FEATURE_SET.has(feature);
}

export async function getUserPlan(userId: string): Promise<BillingPlanId> {
  const subscription = await getSubscriptionRecord(userId);
  return isSubscriptionActive(subscription) ? "pro" : "free";
}
