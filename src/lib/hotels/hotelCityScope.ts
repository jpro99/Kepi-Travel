import { normalizeStayCityKey } from "@/lib/travelAssistant/dayNoteStopRanges";
import type { HotelSearchResult } from "@/lib/hotels/types";

export interface SearchCityCenter {
  lat: number;
  lng: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inCityRadiusKm(searchCity: string): number {
  return isSmallDestination(searchCity) ? 5.5 : 10;
}

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
  searchCenter?: SearchCityCenter,
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
    return haversineKm(searchCenter.lat, searchCenter.lng, hotel.lat!, hotel.lng!) <= inCityRadiusKm(searchCity);
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
  searchCenter?: SearchCityCenter,
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

export function isSmallDestination(displayName: string): boolean {
  const lower = displayName.toLowerCase();
  return /monopoli|polignano|positano|amalfi|ravello|manarola|monterosso|cefalù|cefalu|ortisei|sperlonga|tropea|matera|alberobello|locorotondo|ostuni|gallipoli|otranto|leuca/.test(
    lower,
  );
}
