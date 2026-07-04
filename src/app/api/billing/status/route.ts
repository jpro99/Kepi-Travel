import { NextResponse } from "next/server";
import {
  BILLING_PLANS,
  PLAN_FEATURE_LABELS,
  type BillingPlanDefinition,
  type BillingPlanId,
  type BillingStatusPlan,
  type PlanFeature,
} from "@/lib/billing/plans";
import {
  billingStatusCacheTtlMs,
  getCachedBillingStatus,
  setCachedBillingStatus,
} from "@/lib/billing/billingStatusCache";
import {
  KEPI_PLAN_COOKIE_MAX_AGE_SECONDS,
  KEPI_PLAN_COOKIE_NAME,
  KEPI_PLAN_LIFETIME_VALUE,
} from "@/lib/billing/planCookie";
import {
  resolveEffectivePlanStatus,
  getLifetimePlanFlagFromClerkMetadata,
} from "@/lib/billing/resolveEffectivePlan";
import { getStripePublishableKey } from "@/lib/billing/stripeClient";
import {
  getBillingPlanMirrorKey,
  getLifetimeMirrorStatus,
  getRawSubscriptionRecordForDebug,
  getSubscriptionRecord,
  getSubscriptionStorageKey,
  getUserLifetimeMirrorKey,
} from "@/lib/billing/subscriptionStore";
import { resolveAuthenticatedUserId, isAdminUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { listTrips } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

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

interface BillingStatusPayload {
  plan: BillingStatusPlan;
  basePlan: BillingPlanId;
  definition: BillingPlanDefinition;
  subscription: Awaited<ReturnType<typeof getSubscriptionRecord>>;
  inviteAccess: {
    lifetimePlanActive: boolean;
    trialActive: boolean;
    trialExpiresAt: string | null;
  };
  trialDaysRemaining: number | null;
  nextBillingDate: string | null;
  hasProAccess: boolean;
  usage: {
    tripCount: number;
    tripLimit: number | null;
    tripsRemaining: number | null;
  };
  features: Array<{
    feature: PlanFeature;
    label: string;
    requiresPro: boolean;
    enabled: boolean;
  }>;
  stripeConfigured: boolean;
  stripePlansConfigured: {
    pro: boolean;
    concierge: boolean;
  };
}

function applyLifetimePlanCookie(response: NextResponse): void {
  response.cookies.set({
    name: KEPI_PLAN_COOKIE_NAME,
    value: KEPI_PLAN_LIFETIME_VALUE,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KEPI_PLAN_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
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
  const subscriptionStorageKey = getSubscriptionStorageKey(userId);
  routeLogger.info("Billing read key resolved.", { subscriptionStorageKey });

  const cached = getCachedBillingStatus<BillingStatusPayload>(userId);
  if (cached) {
    const response = NextResponse.json(cached, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
    if (cached.plan === "lifetime") {
      applyLifetimePlanCookie(response);
    }
    return response;
  }

  const [subscriptionRecord, trips, lifetimeMirrorStatus, clerkMetadataHasLifetime] = await Promise.all([
    getSubscriptionRecord(userId),
    listTrips(userId),
    getLifetimeMirrorStatus(userId),
    getLifetimePlanFlagFromClerkMetadata(userId),
  ]);
  const nowMs = Date.now();
  const planStatus = isAdminUserId(userId)
    ? {
        plan: "lifetime" as const,
        basePlan: "pro" as const,
        lifetimePlanActive: true,
        trialActive: false,
        trialDaysRemaining: null,
        nextBillingDate: null,
      }
    : resolveEffectivePlanStatus(
        subscriptionRecord,
        nowMs,
        lifetimeMirrorStatus.hasLifetimeAccess || clerkMetadataHasLifetime,
      );
  const billingPlanMirrorKey = getBillingPlanMirrorKey(userId);
  const userLifetimeMirrorKey = getUserLifetimeMirrorKey(userId);
  const rawSubscriptionRecord = await getRawSubscriptionRecordForDebug(userId);
  routeLogger.info("Billing status subscription lookup complete.", {
    subscriptionStorageKey,
    billingPlanMirrorKey,
    userLifetimeMirrorKey,
    rawSubscriptionRecord,
    billingPlanMirrorRaw: lifetimeMirrorStatus.billingPlanMirrorRaw,
    userLifetimeMirrorRaw: lifetimeMirrorStatus.userLifetimeMirrorRaw,
    clerkMetadataHasLifetime,
  });

  const definition = BILLING_PLANS[planStatus.basePlan];
  const tripLimit = definition.maxTrips;
  const tripCount = trips.length;
  const trialExpiresAt = subscriptionRecord.trialExpiresAt;
  const publishableKey = getStripePublishableKey();
  const stripeProPriceConfigured = Boolean(process.env.STRIPE_PRO_PRICE_ID?.trim());
  const stripeConciergePriceConfigured = Boolean(process.env.STRIPE_CONCIERGE_PRICE_ID?.trim());

  const payload: BillingStatusPayload = {
    plan: planStatus.plan,
    basePlan: planStatus.basePlan,
    definition,
    subscription: subscriptionRecord,
    inviteAccess: {
      lifetimePlanActive: planStatus.lifetimePlanActive,
      trialActive: planStatus.trialActive,
      trialExpiresAt,
    },
    trialDaysRemaining: planStatus.trialDaysRemaining,
    nextBillingDate: planStatus.nextBillingDate,
    hasProAccess: planStatus.plan !== "free",
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
  };
  setCachedBillingStatus(userId, payload);

  const response = NextResponse.json(payload, {
    headers: {
      "Cache-Control": `private, max-age=${Math.floor(billingStatusCacheTtlMs() / 1000)}`,
    },
  });
  if (payload.plan === "lifetime") {
    applyLifetimePlanCookie(response);
  }
  return response;
}
