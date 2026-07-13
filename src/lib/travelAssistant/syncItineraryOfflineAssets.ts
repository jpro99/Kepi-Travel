import type { AirportLayout } from "@/lib/airportNav/types";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  cacheKeyForAirport,
  cacheKeyForCity,
  extractScheduledCityNeeds,
  listRemainingAirportIatas,
  listRemainingCityKeys,
  shouldPrefetchCityMap,
} from "@/lib/travelAssistant/itineraryOfflineCache";
import {
  evictOfflineCacheExcept,
  loadOfflineCacheRecord,
  saveOfflineCacheRecord,
} from "@/lib/travelAssistant/offlineCacheStore";
import { getOfflineCityMapBundle, type OfflineCityMapBundle } from "@/lib/map/offlineCityMapBundle";

export interface SyncItineraryOfflineResult {
  prefetchedAirports: string[];
  prefetchedCities: string[];
  evictedKeys: string[];
  skippedAirports: string[];
}

export async function loadCachedAirportLayout(iata: string): Promise<AirportLayout | null> {
  const key = cacheKeyForAirport(iata);
  const record = await loadOfflineCacheRecord(key);
  if (!record || record.kind !== "airport-layout") return null;
  return record.payload as AirportLayout;
}

export async function saveAirportLayoutToOfflineCache(input: {
  tripId: string;
  layout: AirportLayout;
  savedAt?: string;
}): Promise<void> {
  await saveOfflineCacheRecord({
    key: cacheKeyForAirport(input.layout.iata),
    kind: "airport-layout",
    tripId: input.tripId,
    savedAt: input.savedAt ?? new Date().toISOString(),
    payload: input.layout,
  });
}

async function fetchPublishedAirportLayout(iata: string): Promise<AirportLayout | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`/api/airport-nav/${encodeURIComponent(iata)}/layout`);
    if (!response.ok) return null;
    return (await response.json()) as AirportLayout;
  } catch {
    return null;
  }
}

export async function resolveAirportLayoutForNav(
  iata: string,
  options?: { allowLiveFetch?: boolean },
): Promise<{ layout: AirportLayout | null; source: "cache" | "live" | "none" }> {
  const cached = await loadCachedAirportLayout(iata);
  if (options?.allowLiveFetch !== false && typeof fetch !== "undefined") {
    const live = await fetchPublishedAirportLayout(iata);
    if (live) return { layout: live, source: "live" };
  }
  if (cached) return { layout: cached, source: "cache" };
  return { layout: getAirportLayout(iata), source: getAirportLayout(iata) ? "live" : "none" };
}

export async function loadCachedCityMapBundle(cityKey: string): Promise<OfflineCityMapBundle | null> {
  const key = cacheKeyForCity(cityKey);
  const record = await loadOfflineCacheRecord(key);
  if (!record || record.kind !== "city-map") return null;
  return record.payload as OfflineCityMapBundle;
}

export async function syncItineraryOfflineAssets(input: {
  tripId: string;
  reservations: SessionReservation[];
  nowMs?: number;
}): Promise<SyncItineraryOfflineResult> {
  const nowMs = input.nowMs ?? Date.now();
  const prefetchedAirports: string[] = [];
  const prefetchedCities: string[] = [];
  const skippedAirports: string[] = [];
  const allowedKeys = new Set<string>();

  for (const iata of listRemainingAirportIatas(input.reservations, nowMs)) {
    allowedKeys.add(cacheKeyForAirport(iata));
  }
  for (const cityKey of listRemainingCityKeys(input.reservations, nowMs)) {
    allowedKeys.add(cacheKeyForCity(cityKey));
  }

  for (const iata of listRemainingAirportIatas(input.reservations, nowMs)) {
    const layout = await fetchPublishedAirportLayout(iata) ?? getAirportLayout(iata);
    if (!layout) {
      skippedAirports.push(iata);
      continue;
    }
    await saveAirportLayoutToOfflineCache({
      tripId: input.tripId,
      savedAt: new Date(nowMs).toISOString(),
      layout,
    });
    prefetchedAirports.push(iata);
  }

  for (const need of extractScheduledCityNeeds(input.reservations)) {
    if (!shouldPrefetchCityMap(need.needByUtcMs, nowMs)) continue;
    const bundle = await getOfflineCityMapBundle(need.cityKey);
    if (!bundle) continue;
    await saveOfflineCacheRecord({
      key: cacheKeyForCity(need.cityKey),
      kind: "city-map",
      tripId: input.tripId,
      savedAt: new Date(nowMs).toISOString(),
      payload: bundle,
    });
    prefetchedCities.push(need.cityKey);
  }

  const evictedKeys = await evictOfflineCacheExcept(allowedKeys);
  return { prefetchedAirports, prefetchedCities, evictedKeys, skippedAirports };
}
