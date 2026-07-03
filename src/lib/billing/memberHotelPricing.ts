import type { BillingPlanId } from "@/lib/billing/plans";
import { isMemberHotelPlan } from "@/lib/hotels/guestPricing";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";
/** Pro, Concierge, lifetime, and active trial book hotels at net rate. */
export async function userHasMemberHotelPricing(userId: string): Promise<boolean> {
  const record = await getSubscriptionRecord(userId);
  if (record.lifetimePlan) return true;

  const trialExpiresMs =
    typeof record.trialExpiresAt === "string" && record.trialExpiresAt.length > 0
      ? Date.parse(record.trialExpiresAt)
      : Number.NaN;
  if (!Number.isNaN(trialExpiresMs) && trialExpiresMs > Date.now()) {
    return true;
  }

  const plan: BillingPlanId = isSubscriptionActive(record) ? record.plan : "free";
  return isMemberHotelPlan(plan);
}
