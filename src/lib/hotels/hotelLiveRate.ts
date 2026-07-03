import type { HotelSearchResult } from "@/lib/hotels/types";

/** Kepi can checkout this rate — LiteAPI/Duffel offer id present. */
export function hasKepiBookableLiveRate(
  hotel: Pick<HotelSearchResult, "browseOnly" | "bookOfferId" | "pricePerNight">,
): boolean {
  return Boolean(hotel.bookOfferId && !hotel.browseOnly && hotel.pricePerNight > 0);
}

/** Any numeric nightly rate returned by search (may be indicative only). */
export function hasDisplayNightlyRate(
  hotel: Pick<HotelSearchResult, "browseOnly" | "pricePerNight">,
): boolean {
  return !hotel.browseOnly && Number.isFinite(hotel.pricePerNight) && hotel.pricePerNight > 0;
}
