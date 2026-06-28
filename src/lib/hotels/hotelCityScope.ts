import { normalizeStayCityKey } from "@/lib/travelAssistant/dayNoteStopRanges";
import type { HotelSearchResult } from "@/lib/hotels/types";

/** True when the property name/address clearly belongs to the searched town. */
export function hotelInSearchCity(hotel: HotelSearchResult, searchCity: string): boolean {
  const key = normalizeStayCityKey(searchCity);
  if (!key) return true;

  const blob = `${hotel.name} ${hotel.address} ${hotel.city}`.toLowerCase();
  if (blob.includes(key)) return true;

  const stem = key.split(" ")[0];
  if (stem && stem.length >= 4 && blob.includes(stem)) return true;

  return false;
}

export function partitionHotelsBySearchCity<T extends HotelSearchResult>(
  hotels: T[],
  searchCity: string,
): { inCity: T[]; nearby: T[] } {
  const inCity: T[] = [];
  const nearby: T[] = [];
  for (const hotel of hotels) {
    if (hotelInSearchCity(hotel, searchCity)) inCity.push(hotel);
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
