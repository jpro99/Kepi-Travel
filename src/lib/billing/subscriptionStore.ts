import type { BillingPlanId } from "@/lib/billing/plans";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const SUBSCRIPTION_KEY = "subscription";
const BILLING_SYSTEM_NAMESPACE = "__billing-system";
const STRIPE_CUSTOMER_OWNER_PREFIX = "stripe-customer-owner";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface BillingSubscriptionRecord {
  plan: BillingPlanId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  validUntil: string | null;
}

const FREE_SUBSCRIPTION_RECORD: BillingSubscriptionRecord = {
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  validUntil: null,
};

function sanitizeRecord(input: unknown): BillingSubscriptionRecord {
  if (!input || typeof input !== "object") {
    return FREE_SUBSCRIPTION_RECORD;
  }
  const candidate = input as Partial<BillingSubscriptionRecord>;
  const plan = candidate.plan === "pro" ? "pro" : "free";
  const stripeCustomerId = typeof candidate.stripeCustomerId === "string" ? candidate.stripeCustomerId : null;
  const stripeSubscriptionId =
    typeof candidate.stripeSubscriptionId === "string" ? candidate.stripeSubscriptionId : null;
  const validUntil = typeof candidate.validUntil === "string" ? candidate.validUntil : null;
  return {
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    validUntil,
  };
}

export function isSubscriptionActive(record: BillingSubscriptionRecord): boolean {
  if (record.plan !== "pro") {
    return false;
  }
  if (!record.validUntil) {
    return true;
  }
  return Date.parse(record.validUntil) > Date.now();
}

export async function getSubscriptionRecord(userId: string): Promise<BillingSubscriptionRecord> {
  const stored = await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId });
  return sanitizeRecord(stored);
}

export async function setSubscriptionRecord(userId: string, record: BillingSubscriptionRecord): Promise<void> {
  await kvStoreSet(SUBSCRIPTION_KEY, record, { userId });
}

export async function extendSubscriptionProAccess(userId: string, days: number): Promise<BillingSubscriptionRecord> {
  const grantDays = Math.max(0, Math.round(days));
  const existing = await getSubscriptionRecord(userId);
  if (grantDays <= 0) {
    return existing;
  }

  if (existing.plan === "pro" && existing.validUntil === null && Boolean(existing.stripeSubscriptionId)) {
    return existing;
  }

  const nowMs = Date.now();
  const parsedValidUntil = existing.validUntil ? Date.parse(existing.validUntil) : Number.NaN;
  const baseMs = !Number.isNaN(parsedValidUntil) && parsedValidUntil > nowMs ? parsedValidUntil : nowMs;
  const nextRecord: BillingSubscriptionRecord = {
    ...existing,
    plan: "pro",
    validUntil: new Date(baseMs + grantDays * DAY_IN_MS).toISOString(),
  };
  await setSubscriptionRecord(userId, nextRecord);
  return nextRecord;
}

export async function setStripeCustomerOwner(customerId: string, userId: string): Promise<void> {
  if (!customerId) {
    return;
  }
  await kvStoreSet(`${STRIPE_CUSTOMER_OWNER_PREFIX}/${customerId}`, userId, {
    userId: BILLING_SYSTEM_NAMESPACE,
  });
}

export async function getStripeCustomerOwner(customerId: string): Promise<string | null> {
  if (!customerId) {
    return null;
  }
  return await kvStoreGet<string>(`${STRIPE_CUSTOMER_OWNER_PREFIX}/${customerId}`, {
    userId: BILLING_SYSTEM_NAMESPACE,
  });
}
