import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import type { CabinClass, FusedSearchParams } from "./types";

interface CacheEnvelope<T> {
  value: T;
  expiresAt: number;
}

export const CASH_TTL_SECONDS = 180;
export const AWARD_TTL_SECONDS = 1800;

const CACHE_USER = "global";

function cabinTag(cabin: CabinClass): string {
  return cabin.replace(/_/g, "");
}

export function cashCacheKey(p: FusedSearchParams): string {
  return `flights:cash:${p.origin}:${p.destination}:${p.departDate}:${p.returnDate ?? "ow"}:${p.passengers}:${cabinTag(p.cabin)}`;
}

export function awardCacheKey(p: FusedSearchParams): string {
  return `flights:award:${p.origin}:${p.destination}:${p.departDate}:${cabinTag(p.cabin)}`;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const stored = await kvStoreGet<CacheEnvelope<T>>(key, { userId: CACHE_USER });
    if (
      stored &&
      typeof stored === "object" &&
      typeof stored.expiresAt === "number" &&
      stored.expiresAt > Date.now()
    ) {
      return stored.value;
    }
  } catch {
    /* cache miss */
  }
  return null;
}

async function writeCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await kvStoreSet(key, envelope, { userId: CACHE_USER });
  } catch {
    /* best-effort */
  }
}

export interface CachedResult<T> {
  value: T;
  cached: boolean;
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const hit = await readCache<T>(key);
  if (hit !== null) {
    return { value: hit, cached: true };
  }
  const value = await fetcher();
  if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
    await writeCache(key, value, ttlSeconds);
  }
  return { value, cached: false };
}
