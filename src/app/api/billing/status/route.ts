import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { BILLING_PLANS, PLAN_FEATURE_LABELS, type PlanFeature } from "@/lib/billing/plans";
import { getUserPlan } from "@/lib/billing/planGate";
import { getStripePublishableKey } from "@/lib/billing/stripeClient";
import { getSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { listTrips } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURES: PlanFeature[] = [
  "gmail-import",
  "ai-suggestions",
  "push-notifications",
  "multi-trip",
  "concierge-monitoring",
  "concierge-auto-rebook",
  "concierge-priority-support",
  "concierge-lounge-access",
];

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/billing/status",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized billing status request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [plan, subscriptionRecord, trips] = await Promise.all([
    getUserPlan(userId),
    getSubscriptionRecord(userId),
    listTrips(userId),
  ]);
  const definition = BILLING_PLANS[plan];
  const tripLimit = definition.maxTrips;
  const tripCount = trips.length;
  const publishableKey = getStripePublishableKey();
  const stripeProPriceConfigured = Boolean(process.env.STRIPE_PRO_PRICE_ID?.trim());
  const stripeConciergePriceConfigured = Boolean(process.env.STRIPE_CONCIERGE_PRICE_ID?.trim());

  return NextResponse.json({
    plan,
    definition,
    subscription: subscriptionRecord,
    usage: {
      tripCount,
      tripLimit,
      tripsRemaining: tripLimit === null ? null : Math.max(0, tripLimit - tripCount),
    },
    features: FEATURES.map((feature) => ({
      feature,
      label: PLAN_FEATURE_LABELS[feature],
      requiresPro: !feature.startsWith("concierge-"),
      enabled: definition.enabledFeatures.includes(feature),
    })),
    stripeConfigured: Boolean(publishableKey && (stripeProPriceConfigured || stripeConciergePriceConfigured)),
    stripePlansConfigured: {
      pro: stripeProPriceConfigured,
      concierge: stripeConciergePriceConfigured,
    },
  });
}
