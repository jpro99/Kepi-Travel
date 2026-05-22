import { randomUUID } from "node:crypto";
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
import { getStripePublishableKey } from "@/lib/billing/stripeClient";
import {
  getRawSubscriptionRecordForDebug,
  getSubscriptionRecord,
  getSubscriptionStorageKey,
  isSubscriptionActive,
} from "@/lib/billing/subscriptionStore";
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function resolveEffectivePlanStatus(
  subscriptionRecord: Awaited<ReturnType<typeof getSubscriptionRecord>>,
  nowMs: number,
): {
  plan: BillingStatusPlan;
  basePlan: BillingPlanId;
  lifetimePlanActive: boolean;
  trialActive: boolean;
  trialDaysRemaining: number | null;
  nextBillingDate: string | null;
} {
  const lifetimePlanActive = subscriptionRecord.lifetimePlan;
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

  const [subscriptionRecord, trips] = await Promise.all([getSubscriptionRecord(userId), listTrips(userId)]);
  const nowMs = Date.now();
  const planStatus = resolveEffectivePlanStatus(subscriptionRecord, nowMs);
  const subscriptionStorageKey = getSubscriptionStorageKey(userId);
  const rawSubscriptionRecord = await getRawSubscriptionRecordForDebug(userId);
  console.info("[billing/status] subscription lookup", {
    userId,
    subscriptionStorageKey,
    rawSubscriptionRecord,
  });
  routeLogger.info("Billing status subscription lookup complete.", {
    subscriptionStorageKey,
    rawSubscriptionRecord,
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
