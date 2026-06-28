import { normalizeStayCityKey } from "@/lib/travelAssistant/dayNoteStopRanges";
import {
  areCoordsTrusted,
  fixPossibleLatLngSwap,
  haversineKm,
  inCityRadiusKm,
  isSmallDestination,
} from "@/lib/hotels/hotelGeo";
import type { SearchCenter } from "@/lib/hotels/hotelGeo";
import type { HotelSearchResult } from "@/lib/hotels/types";

export type { SearchCenter };

export { isSmallDestination };

/** Parse a city name from a postal address when provider metadata is missing. */
export function cityFromAddress(address: string | undefined): string {
  if (!address?.trim()) return "";
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2] ?? "";
  }
  return parts[0] ?? "";
}

/**
 * True when the property sits in the town the user searched.
 * Uses coordinates when available — never trusts hotel.city alone (providers stamp the search label on every row).
 */
export function hotelInSearchCity(
  hotel: HotelSearchResult,
  searchCity: string,
  searchCenter?: SearchCenter,
): boolean {
  const key = normalizeStayCityKey(searchCity);
  if (!key) return true;

  if (
    searchCenter &&
    Number.isFinite(hotel.lat) &&
    Number.isFinite(hotel.lng) &&
    Number.isFinite(searchCenter.lat) &&
    Number.isFinite(searchCenter.lng)
  ) {
    const fixed = fixPossibleLatLngSwap(hotel.lat!, hotel.lng!, searchCenter);
    if (areCoordsTrusted(fixed.lat, fixed.lng, searchCenter, searchCity)) {
      return haversineKm(searchCenter.lat, searchCenter.lng, fixed.lat, fixed.lng) <= inCityRadiusKm(searchCity);
    }
  }

  const searchLabel = searchCity.toLowerCase().trim();
  const providerCity = hotel.city.toLowerCase().trim();
  const trustedCity =
    providerCity &&
    providerCity !== searchLabel &&
    normalizeStayCityKey(hotel.city) !== key
      ? hotel.city
      : cityFromAddress(hotel.address);

  const cityKey = key.split(",")[0]?.trim() || key;
  const blob = `${hotel.name} ${hotel.address} ${trustedCity}`.toLowerCase();
  if (blob.includes(cityKey) || blob.includes(key)) return true;

  const stem = cityKey.split(/\s+/)[0];
  if (stem && stem.length >= 4 && blob.includes(stem)) return true;

  return false;
}

export function partitionHotelsBySearchCity<T extends HotelSearchResult & { inSearchCity?: boolean }>(
  hotels: T[],
  searchCity: string,
  searchCenter?: SearchCenter,
): { inCity: T[]; nearby: T[] } {
  const inCity: T[] = [];
  const nearby: T[] = [];
  for (const hotel of hotels) {
    const inside =
      hotel.inSearchCity ?? hotelInSearchCity(hotel, searchCity, searchCenter);
    if (inside) inCity.push(hotel);
    else nearby.push(hotel);
  }
  return { inCity, nearby };
}
