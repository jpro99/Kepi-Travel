import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { getStripeClient } from "@/lib/billing/stripeClient";
import {
  getStripeCustomerOwner,
  getSubscriptionRecord,
  setStripeCustomerOwner,
  setSubscriptionRecord,
} from "@/lib/billing/subscriptionStore";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleCheckoutCompleted(
  _stripe: Stripe,
  session: Stripe.Checkout.Session,
  webhookLogger: ReturnType<typeof logger.withContext>,
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
  if (!userId) {
    webhookLogger.warn("Stripe checkout session completed without a user id.");
    return;
  }

  const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const validUntil = null;

  await setSubscriptionRecord(userId, {
    plan: "pro",
    stripeCustomerId,
    stripeSubscriptionId,
    validUntil,
  });
  if (stripeCustomerId) {
    await setStripeCustomerOwner(stripeCustomerId, userId);
  }
  await trackServerEvent({
    type: "upgrade_completed",
    userId,
    newPlan: "pro",
  });
  webhookLogger.info("Stripe checkout completion stored subscription state.", {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  webhookLogger: ReturnType<typeof logger.withContext>,
): Promise<void> {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const userId = subscription.metadata?.userId ?? (stripeCustomerId ? await getStripeCustomerOwner(stripeCustomerId) : null);
  if (!userId) {
    webhookLogger.warn("Stripe subscription deletion received without a linked user.");
    return;
  }

  const existingRecord = await getSubscriptionRecord(userId);
  await setSubscriptionRecord(userId, {
    plan: "free",
    stripeCustomerId: stripeCustomerId ?? existingRecord.stripeCustomerId,
    stripeSubscriptionId: null,
    validUntil: null,
  });
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const webhookLogger = logger.withContext({
    requestId,
    route: "/api/billing/webhook",
  });

  if (!stripe || !webhookSecret) {
    webhookLogger.warn("Stripe webhook called while billing is not configured.");
    return NextResponse.json({ error: "Billing webhooks are not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    webhookLogger.warn("Stripe webhook signature validation failed.", { error });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session, webhookLogger);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, webhookLogger);
        break;
      default:
        webhookLogger.info("Unhandled Stripe webhook event type.", { eventType: event.type });
        break;
    }
  } catch (error) {
    webhookLogger.error("Stripe webhook handling failed.", error instanceof Error ? error : undefined, {
      eventType: event.type,
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
