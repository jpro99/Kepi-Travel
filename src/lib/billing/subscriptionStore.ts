import type { BillingPlanId } from "@/lib/billing/plans";
import { kv } from "@vercel/kv";
import { invalidateCachedBillingStatus } from "@/lib/billing/billingStatusCache";
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
  lifetimePlan: boolean;
  trialExpiresAt: string | null;
}

const FREE_SUBSCRIPTION_RECORD: BillingSubscriptionRecord = {
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  validUntil: null,
  lifetimePlan: false,
  trialExpiresAt: null,
};

function sanitizeRecord(input: unknown): BillingSubscriptionRecord {
  if (!input || typeof input !== "object") {
    return FREE_SUBSCRIPTION_RECORD;
  }
  const candidate = input as Partial<BillingSubscriptionRecord>;
  const plan = candidate.plan === "concierge" ? "concierge" : candidate.plan === "pro" ? "pro" : "free";
  const stripeCustomerId = typeof candidate.stripeCustomerId === "string" ? candidate.stripeCustomerId : null;
  const stripeSubscriptionId =
    typeof candidate.stripeSubscriptionId === "string" ? candidate.stripeSubscriptionId : null;
  const validUntil = typeof candidate.validUntil === "string" ? candidate.validUntil : null;
  const lifetimePlan = Boolean(candidate.lifetimePlan);
  const trialExpiresAt = typeof candidate.trialExpiresAt === "string" ? candidate.trialExpiresAt : null;
  return {
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    validUntil,
    lifetimePlan,
    trialExpiresAt,
  };
}

export function isSubscriptionActive(record: BillingSubscriptionRecord): boolean {
  if (record.lifetimePlan) {
    return true;
  }
  if (record.trialExpiresAt) {
    return Date.parse(record.trialExpiresAt) > Date.now();
  }
  if (record.plan === "free") {
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
  invalidateCachedBillingStatus(userId);
}

export function getSubscriptionStorageKey(userId: string): string {
  return `kepi:${userId.trim()}:subscription`;
}

export async function getRawSubscriptionRecordForDebug(userId: string): Promise<unknown> {
  if (isKvConfigured()) {
    return (await kv.get<unknown>(getSubscriptionStorageKey(userId))) ?? null;
  }
  return await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId });
}

export async function extendSubscriptionProAccess(userId: string, days: number): Promise<BillingSubscriptionRecord> {
  const grantDays = Math.max(0, Math.round(days));
  const existing = await getSubscriptionRecord(userId);
  if (existing.lifetimePlan) {
    return existing;
  }
  if (grantDays <= 0) {
    return existing;
  }

  if ((existing.plan === "pro" || existing.plan === "concierge") && existing.validUntil === null && Boolean(existing.stripeSubscriptionId)) {
    return existing;
  }

  const nowMs = Date.now();
  const parsedValidUntil = existing.validUntil ? Date.parse(existing.validUntil) : Number.NaN;
  const baseMs = !Number.isNaN(parsedValidUntil) && parsedValidUntil > nowMs ? parsedValidUntil : nowMs;
  const nextRecord: BillingSubscriptionRecord = {
    ...existing,
    plan: existing.plan === "concierge" ? "concierge" : "pro",
    validUntil: new Date(baseMs + grantDays * DAY_IN_MS).toISOString(),
    lifetimePlan: existing.lifetimePlan,
    trialExpiresAt: existing.trialExpiresAt,
  };
  await setSubscriptionRecord(userId, nextRecord);
  return nextRecord;
}

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

function extractUserIdFromSubscriptionKey(key: string): string | null {
  const parts = key.split(":");
  if (parts.length < 3 || parts[0] !== "kepi") {
    return null;
  }
  return parts[1] || null;
}

export async function listExpiredTrialUserIds(limit = 1000): Promise<string[]> {
  if (!isKvConfigured()) {
    return [];
  }
  const userIds: string[] = [];
  const seen = new Set<string>();
  const nowMs = Date.now();
  for await (const key of kv.scanIterator({ match: "kepi:*:subscription" })) {
    const keyString = String(key);
    const userId = extractUserIdFromSubscriptionKey(keyString);
    if (!userId || userId.startsWith("__") || seen.has(userId)) {
      continue;
    }
    const stored = await kv.get<unknown>(keyString);
    const record = sanitizeRecord(stored);
    if (
      record.plan === "pro" &&
      !record.lifetimePlan &&
      typeof record.trialExpiresAt === "string" &&
      Date.parse(record.trialExpiresAt) <= nowMs
    ) {
      seen.add(userId);
      userIds.push(userId);
      if (userIds.length >= limit) {
        break;
      }
    }
  }
  return userIds;
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
