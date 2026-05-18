import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripeClient";
import { getSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/billing/portal",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized billing portal request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/billing/portal",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many billing portal requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing is not configured yet. Please contact support." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  const subscription = await getSubscriptionRecord(userId);
  if (!subscription.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer exists for this account yet." },
      { status: 400, headers: rateLimit.headers },
    );
  }

  const requestUrl = new URL(req.url);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: new URL("/billing", requestUrl.origin).toString(),
  });
  routeLogger.info("Stripe customer portal session created.");

  return NextResponse.json(
    {
      url: portalSession.url,
    },
    { headers: rateLimit.headers },
  );
}
