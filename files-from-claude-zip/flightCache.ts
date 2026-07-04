// src/lib/flights/flightCache.ts
// Read-through cache for expensive flight-source calls (Duffel, Seats.aero),
// the single highest-leverage A++ upgrade: both APIs cost money per call and add
// seconds of latency. Caching cuts the bill and is the most likely cure for a
// timeout/retry loop on heavy "analyze" runs.
//
// Manual TTL: we store { value, expiresAt } and check it on read, so this works
// regardless of whether your kvStoreSet supports an EX/TTL argument. No
// dependency on Redis-specific expiry semantics.

import type { CabinClass, FusedSearchParams } from "./types";

interface CacheEnvelope<T> {
  value: T;
  expiresAt: number; // epoch ms
}

// Sensible defaults. Award space moves slower than cash fares.
export const CASH_TTL_SECONDS = 180; // 3 min
export const AWARD_TTL_SECONDS = 1800; // 30 min

function cabinTag(cabin: CabinClass): string {
  return cabin.replace(/_/g, "");
}

export function cashCacheKey(p: FusedSearchParams): string {
  return `flights:cash:${p.origin}:${p.destination}:${p.departDate}:${p.returnDate ?? "ow"}:${p.passengers}:${cabinTag(p.cabin)}`;
}

export function awardCacheKey(p: FusedSearchParams): string {
  // Award space is per-person and program-wide, so passenger count and return
  // date don't change the per-segment availability we cache.
  return `flights:award:${p.origin}:${p.destination}:${p.departDate}:${cabinTag(p.cabin)}`;
}

// Returns the cached value if present and unexpired, else null.
async function readCache<T>(key: string): Promise<T | null> {
  try {
    const { kvStoreGet } = await import("@/lib/redis");
    const stored = (await kvStoreGet(key)) as CacheEnvelope<T> | null;
    if (
      stored &&
      typeof stored === "object" &&
      typeof stored.expiresAt === "number" &&
      stored.expiresAt > Date.now()
    ) {
      return stored.value;
    }
  } catch {
    // cache miss on any error — never let cache failure break the search
  }
  return null;
}

async function writeCache<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const { kvStoreSet } = await import("@/lib/redis");
    const envelope: CacheEnvelope<T> = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    // Pass the object directly — kvStoreSet auto-serializes (your rule).
    await kvStoreSet(key, envelope);
  } catch {
    // best-effort; a failed write just means a future miss
  }
}

export interface CachedResult<T> {
  value: T;
  cached: boolean;
}

// Read-through wrapper: serve from cache, else run fetcher and populate.
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<CachedResult<T>> {
  const hit = await readCache<T>(key);
  if (hit !== null) {
    return { value: hit, cached: true };
  }
  const value = await fetcher();
  // Only cache truthy/non-empty results so a transient empty failure doesn't
  // get pinned for the whole TTL.
  if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
    await writeCache(key, value, ttlSeconds);
  }
  return { value, cached: false };
}
