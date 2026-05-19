import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/planGate";
import type { BillingPlanId } from "@/lib/billing/plans";
import { getStripeClient } from "@/lib/billing/stripeClient";
import { getSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutBodySchema = z.object({
  targetPlan: z.enum(["pro", "concierge"]).default("pro"),
  successPath: z.string().trim().min(1).max(200).default("/billing?checkout=success"),
  cancelPath: z.string().trim().min(1).max(200).default("/billing?checkout=cancelled"),
});

function resolveStripePriceId(plan: "pro" | "concierge"): string | null {
  if (plan === "concierge") {
    const conciergePriceId = process.env.STRIPE_CONCIERGE_PRICE_ID?.trim();
    return conciergePriceId || null;
  }
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
  return proPriceId || null;
}

function canUpgradeToPlan(currentPlan: BillingPlanId, targetPlan: "pro" | "concierge"): boolean {
  if (targetPlan === "pro") {
    return currentPlan === "free";
  }
  return currentPlan !== "concierge";
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/billing/checkout",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized billing checkout request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/billing/checkout",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    routeLogger.warn("Stripe checkout unavailable due to missing configuration.", {
      stripeConfigured: Boolean(stripe),
    });
    return NextResponse.json(
      { error: "Billing is not configured yet. Please contact support." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const parsedBody = CheckoutBodySchema.safeParse(payload);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }
  const targetPlan = parsedBody.data.targetPlan;
  const stripePriceId = resolveStripePriceId(targetPlan);
  if (!stripePriceId) {
    routeLogger.warn("Stripe checkout unavailable due to missing plan price id.", { targetPlan });
    return NextResponse.json(
      { error: "Billing is not configured for this plan yet. Please contact support." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  const currentPlan = await getUserPlan(userId);
  if (!canUpgradeToPlan(currentPlan, targetPlan)) {
    return NextResponse.json(
      { error: targetPlan === "concierge" ? "Your account is already on Concierge." : "Your account is already paid." },
      { status: 409, headers: rateLimit.headers },
    );
  }

  const requestUrl = new URL(req.url);
  const successUrl = new URL(parsedBody.data.successPath, requestUrl.origin).toString();
  const cancelUrl = new URL(parsedBody.data.cancelPath, requestUrl.origin).toString();
  const existingSubscription = await getSubscriptionRecord(userId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    customer: existingSubscription.stripeCustomerId ?? undefined,
    customer_creation: existingSubscription.stripeCustomerId ? undefined : "always",
    client_reference_id: userId,
    allow_promotion_codes: true,
    metadata: {
      userId,
      plan: targetPlan,
    },
    subscription_data: {
      metadata: {
        userId,
        plan: targetPlan,
      },
    },
  });

  routeLogger.info("Stripe checkout session created.", {
    checkoutSessionId: session.id,
  });

  return NextResponse.json(
    {
      checkoutSessionId: session.id,
      url: session.url,
    },
    { headers: rateLimit.headers },
  );
}
