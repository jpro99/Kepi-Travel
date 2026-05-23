import type { BillingPlanId, BillingStatusPlan } from "@/lib/billing/plans";
import { kv } from "@vercel/kv";
import { invalidateCachedBillingStatus } from "@/lib/billing/billingStatusCache";
import { logger } from "@/lib/logger";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const SUBSCRIPTION_KEY = "subscription";
const BILLING_SYSTEM_NAMESPACE = "__billing-system";
const STRIPE_CUSTOMER_OWNER_PREFIX = "stripe-customer-owner";
const BILLING_PLAN_MIRROR_KEY_PREFIX = "billing:plan:clerk_";
const USER_LIFETIME_MIRROR_KEY_PREFIX = "user:lifetime:";
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
  const normalizedUserId = normalizeClerkUserIdForStorage(userId);
  let stored: unknown = null;
  if (isKvConfigured()) {
    try {
      stored = await kv.get<unknown>(getSubscriptionStorageKey(normalizedUserId));
    } catch (error) {
      logger.warn("Subscription KV get failed. Falling back to namespaced KV store.", {
        scope: "billing/subscriptionStore",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
      stored = await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId: normalizedUserId });
    }
  } else {
    stored = await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId: normalizedUserId });
  }
  return sanitizeRecord(stored);
}

export async function setSubscriptionRecord(userId: string, record: BillingSubscriptionRecord): Promise<void> {
  const normalizedUserId = normalizeClerkUserIdForStorage(userId);
  if (isKvConfigured()) {
    try {
      await Promise.all([
        kv.set(getSubscriptionStorageKey(normalizedUserId), record),
        setLifetimePlanMirrors(normalizedUserId, record),
      ]);
    } catch (error) {
      logger.warn("Subscription KV set failed. Falling back to namespaced KV store.", {
        scope: "billing/subscriptionStore",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
      await Promise.all([
        kvStoreSet(SUBSCRIPTION_KEY, record, { userId: normalizedUserId }),
        setLifetimePlanMirrors(normalizedUserId, record),
      ]);
    }
  } else {
    await Promise.all([
      kvStoreSet(SUBSCRIPTION_KEY, record, { userId: normalizedUserId }),
      setLifetimePlanMirrors(normalizedUserId, record),
    ]);
  }
  invalidateCachedBillingStatus(userId);
}

export function getSubscriptionStorageKey(userId: string): string {
  return `kepi:${normalizeClerkUserIdForStorage(userId)}:subscription`;
}

export function getBillingPlanMirrorKey(userId: string): string {
  return `${BILLING_PLAN_MIRROR_KEY_PREFIX}${normalizeClerkUserIdForStorage(userId)}`;
}

export function getUserLifetimeMirrorKey(userId: string): string {
  return `${USER_LIFETIME_MIRROR_KEY_PREFIX}${normalizeClerkUserIdForStorage(userId)}`;
}

export async function getRawSubscriptionRecordForDebug(userId: string): Promise<unknown> {
  const normalizedUserId = normalizeClerkUserIdForStorage(userId);
  if (isKvConfigured()) {
    try {
      return (await kv.get<unknown>(getSubscriptionStorageKey(normalizedUserId))) ?? null;
    } catch (error) {
      logger.warn("Raw subscription KV get failed. Falling back to namespaced KV store.", {
        scope: "billing/subscriptionStore",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId: normalizedUserId });
    }
  }
  return await kvStoreGet<unknown>(SUBSCRIPTION_KEY, { userId: normalizedUserId });
}

export async function getLifetimeMirrorStatus(userId: string): Promise<{
  billingPlanMirrorRaw: unknown;
  userLifetimeMirrorRaw: unknown;
  hasLifetimeAccess: boolean;
}> {
  const normalizedUserId = normalizeClerkUserIdForStorage(userId);
  const billingPlanMirrorKey = getBillingPlanMirrorKey(normalizedUserId);
  const userLifetimeMirrorKey = getUserLifetimeMirrorKey(normalizedUserId);
  if (isKvConfigured()) {
    try {
      const [billingPlanMirrorRaw, userLifetimeMirrorRaw] = await Promise.all([
        kv.get<unknown>(billingPlanMirrorKey),
        kv.get<unknown>(userLifetimeMirrorKey),
      ]);
      return {
        billingPlanMirrorRaw: billingPlanMirrorRaw ?? null,
        userLifetimeMirrorRaw: userLifetimeMirrorRaw ?? null,
        hasLifetimeAccess: isLifetimeMirrorValue(billingPlanMirrorRaw, userLifetimeMirrorRaw),
      };
    } catch (error) {
      logger.warn("Lifetime mirror KV lookup failed. Falling back to namespaced KV store.", {
        scope: "billing/subscriptionStore",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  const [billingPlanMirrorRaw, userLifetimeMirrorRaw] = await Promise.all([
    kvStoreGet<unknown>(billingPlanMirrorKey, { userId: BILLING_SYSTEM_NAMESPACE }),
    kvStoreGet<unknown>(userLifetimeMirrorKey, { userId: BILLING_SYSTEM_NAMESPACE }),
  ]);
  return {
    billingPlanMirrorRaw: billingPlanMirrorRaw ?? null,
    userLifetimeMirrorRaw: userLifetimeMirrorRaw ?? null,
    hasLifetimeAccess: isLifetimeMirrorValue(billingPlanMirrorRaw, userLifetimeMirrorRaw),
  };
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

function normalizeClerkUserIdForStorage(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) {
    return normalized;
  }
  return normalized.startsWith("user_") ? normalized : `user_${normalized}`;
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
  try {
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
  } catch (error) {
    logger.warn("Expired trial scan failed; returning empty trial user list.", {
      scope: "billing/subscriptionStore",
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
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

async function setLifetimePlanMirrors(userId: string, record: BillingSubscriptionRecord): Promise<void> {
  const normalizedUserId = normalizeClerkUserIdForStorage(userId);
  const billingPlanMirrorKey = getBillingPlanMirrorKey(normalizedUserId);
  const userLifetimeMirrorKey = getUserLifetimeMirrorKey(normalizedUserId);
  const nowMs = Date.now();
  const billingPlanMirrorValue = resolvePlanMirrorValue(record, nowMs);
  const userLifetimeMirrorValue = record.lifetimePlan;
  if (isKvConfigured()) {
    try {
      await Promise.all([
        kv.set(billingPlanMirrorKey, billingPlanMirrorValue),
        kv.set(userLifetimeMirrorKey, userLifetimeMirrorValue),
      ]);
      return;
    } catch (error) {
      logger.warn("Lifetime mirror KV write failed. Falling back to namespaced KV store.", {
        scope: "billing/subscriptionStore",
        userId: normalizedUserId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  await Promise.all([
    kvStoreSet(billingPlanMirrorKey, billingPlanMirrorValue, { userId: BILLING_SYSTEM_NAMESPACE }),
    kvStoreSet(userLifetimeMirrorKey, userLifetimeMirrorValue, { userId: BILLING_SYSTEM_NAMESPACE }),
  ]);
}

function resolvePlanMirrorValue(record: BillingSubscriptionRecord, nowMs: number): BillingStatusPlan {
  if (record.lifetimePlan) {
    return "lifetime";
  }
  const trialExpiresMs =
    typeof record.trialExpiresAt === "string" && record.trialExpiresAt.length > 0
      ? Date.parse(record.trialExpiresAt)
      : Number.NaN;
  if (!Number.isNaN(trialExpiresMs) && trialExpiresMs > nowMs) {
    return "trial";
  }
  if (record.plan === "concierge" && isSubscriptionActive(record)) {
    return "concierge";
  }
  if (record.plan === "pro" && isSubscriptionActive(record)) {
    return "pro";
  }
  return "free";
}

function isLifetimeMirrorValue(planMirror: unknown, lifetimeMirror: unknown): boolean {
  if (typeof planMirror === "string" && planMirror.trim().toLowerCase() === "lifetime") {
    return true;
  }
  if (typeof lifetimeMirror === "boolean") {
    return lifetimeMirror;
  }
  if (typeof lifetimeMirror === "number") {
    return lifetimeMirror === 1;
  }
  if (typeof lifetimeMirror === "string") {
    const normalized = lifetimeMirror.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "lifetime" || normalized === "yes";
  }
  return false;
}
