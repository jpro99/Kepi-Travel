import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/planGate";
import { getStripeClient } from "@/lib/billing/stripeClient";
import { getSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutBodySchema = z.object({
  successPath: z.string().trim().min(1).max(200).default("/billing?checkout=success"),
  cancelPath: z.string().trim().min(1).max(200).default("/billing?checkout=cancelled"),
});

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
  const stripePriceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!stripe || !stripePriceId) {
    routeLogger.warn("Stripe checkout unavailable due to missing configuration.", {
      stripeConfigured: Boolean(stripe),
      hasPriceId: Boolean(stripePriceId),
    });
    return NextResponse.json(
      { error: "Billing is not configured yet. Please contact support." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  const currentPlan = await getUserPlan(userId);
  if (currentPlan === "pro") {
    return NextResponse.json(
      { error: "Your account is already on Pro." },
      { status: 409, headers: rateLimit.headers },
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
      plan: "pro",
    },
    subscription_data: {
      metadata: {
        userId,
        plan: "pro",
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
