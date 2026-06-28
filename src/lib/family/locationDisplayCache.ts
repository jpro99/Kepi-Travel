import { shouldDisplayGeolocationFix } from "@/lib/family/geolocationQuality";
import { haversineMeters } from "@/lib/geo/haversineMeters";

export interface CachedMapLocation {
  lat: number;
  lon: number;
  accuracy?: number;
  updatedAt: string;
}

const cache = new Map<string, CachedMapLocation>();

/** Drop stale cached pins after 45 minutes. */
const CACHE_TTL_MS = 45 * 60_000;

/** Reject map jumps larger than this unless the new fix is very precise. */
const MAX_JUMP_WITHOUT_PRECISION_M = 120;

export function resolveLocationForMapDisplay(
  memberId: string,
  incoming: CachedMapLocation,
): CachedMapLocation | null {
  const cached = cache.get(memberId);
  const incomingOk = shouldDisplayGeolocationFix(incoming.accuracy);

  if (cached && Date.now() - Date.parse(cached.updatedAt) > CACHE_TTL_MS) {
    cache.delete(memberId);
  }

  const freshCached = cache.get(memberId);

  if (incomingOk) {
    if (freshCached) {
      const jump = haversineMeters(freshCached.lat, freshCached.lon, incoming.lat, incoming.lon);
      const incomingAcc = incoming.accuracy ?? 999;
      if (jump > MAX_JUMP_WITHOUT_PRECISION_M && incomingAcc > 35) {
        return freshCached;
      }
    }
    cache.set(memberId, incoming);
    return incoming;
  }

  return freshCached ?? null;
}

export function clearLocationDisplayCache(memberId?: string): void {
  if (memberId) cache.delete(memberId);
  else cache.clear();
}
