export type BillingPlanId = "free" | "pro" | "concierge";

export type PlanFeature =
  | "gmail-import"
  | "ai-suggestions"
  | "push-notifications"
  | "multi-trip"
  | "concierge-monitoring"
  | "concierge-auto-rebook"
  | "concierge-priority-support"
  | "concierge-lounge-access";

export interface BillingPlanDefinition {
  id: BillingPlanId;
  name: string;
  monthlyPriceCents: number;
  tagline: string;
  maxTrips: number | null;
  enabledFeatures: PlanFeature[];
}

export const FREE_PLAN: BillingPlanDefinition = {
  id: "free",
  name: "Free",
  monthlyPriceCents: 0,
  tagline: "Essential trip execution for one active trip.",
  maxTrips: 1,
  enabledFeatures: [],
};

export const PRO_PLAN: BillingPlanDefinition = {
  id: "pro",
  name: "Pro",
  monthlyPriceCents: 900,
  tagline: "Advanced automation for complex travel operations.",
  maxTrips: null,
  enabledFeatures: ["gmail-import", "ai-suggestions", "push-notifications", "multi-trip"],
};

export const CONCIERGE_PLAN: BillingPlanDefinition = {
  id: "concierge",
  name: "Concierge",
  monthlyPriceCents: 2900,
  tagline: "VIP proactive operations with concierge-only automation.",
  maxTrips: null,
  enabledFeatures: [
    "gmail-import",
    "ai-suggestions",
    "push-notifications",
    "multi-trip",
    "concierge-monitoring",
    "concierge-auto-rebook",
    "concierge-priority-support",
    "concierge-lounge-access",
  ],
};

export const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  concierge: CONCIERGE_PLAN,
};

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  "gmail-import": "Gmail reservation import",
  "ai-suggestions": "AI itinerary guidance",
  "push-notifications": "Gate and delay push alerts",
  "multi-trip": "Multiple saved trips",
  "concierge-monitoring": "5-minute proactive monitoring",
  "concierge-auto-rebook": "Automatic best-action rebooking",
  "concierge-priority-support": "Priority human concierge support",
  "concierge-lounge-access": "VIP lounge intelligence",
};

export function formatPlanPrice(monthlyPriceCents: number): string {
  if (monthlyPriceCents <= 0) {
    return "$0";
  }
  return `$${(monthlyPriceCents / 100).toFixed(0)}/month`;
}
