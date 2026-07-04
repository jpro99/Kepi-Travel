import type { BillingPlanId, PlanFeature } from "@/lib/billing/plans";
import { BILLING_PLANS, PRO_PLAN } from "@/lib/billing/plans";
import { resolveUserEffectivePlanStatus } from "@/lib/billing/resolveEffectivePlan";
import { isAdminUserId } from "@/lib/admin/adminAccess";

const PRO_FEATURE_SET = new Set<PlanFeature>(PRO_PLAN.enabledFeatures);
const CONCIERGE_ONLY_FEATURES = new Set<PlanFeature>([
  "concierge-monitoring",
  "concierge-auto-rebook",
  "concierge-priority-support",
  "concierge-lounge-access",
]);

export function requiresPro(feature: PlanFeature): boolean {
  return PRO_FEATURE_SET.has(feature) && !CONCIERGE_ONLY_FEATURES.has(feature);
}

export function requiresConcierge(feature: PlanFeature): boolean {
  return CONCIERGE_ONLY_FEATURES.has(feature);
}

export function isFeatureEnabled(plan: BillingPlanId, feature: PlanFeature): boolean {
  return BILLING_PLANS[plan].enabledFeatures.includes(feature);
}

export async function getUserPlan(userId: string): Promise<BillingPlanId> {
  if (isAdminUserId(userId)) {
    return "pro";
  }
  const status = await resolveUserEffectivePlanStatus(userId);
  return status.basePlan;
}

/** Same Pro/trial/lifetime/admin rules as /api/billing/status — use for feature gates. */
export async function userHasProAccess(userId: string): Promise<boolean> {
  if (isAdminUserId(userId)) {
    return true;
  }
  const status = await resolveUserEffectivePlanStatus(userId);
  return status.basePlan !== "free";
}
