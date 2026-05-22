const BILLING_STATUS_CACHE_TTL_MS = 60_000;

const billingStatusCache = new Map<string, { expiresAt: number; value: unknown }>();

export function getCachedBillingStatus<T>(userId: string): T | null {
  const key = userId.trim();
  const cached = billingStatusCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    billingStatusCache.delete(key);
    return null;
  }
  return cached.value as T;
}

export function setCachedBillingStatus<T>(userId: string, value: T): void {
  const key = userId.trim();
  billingStatusCache.set(key, {
    expiresAt: Date.now() + BILLING_STATUS_CACHE_TTL_MS,
    value,
  });
}

export function invalidateCachedBillingStatus(userId: string): void {
  billingStatusCache.delete(userId.trim());
}

export function billingStatusCacheTtlMs(): number {
  return BILLING_STATUS_CACHE_TTL_MS;
}
