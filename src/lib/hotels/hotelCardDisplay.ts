import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import { hasDisplayNightlyRate, hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";

export const KEPI_GOLD = "#f4c95d";
export const KEPI_NAVY = "#0b1f3a";

export interface HotelHeroVisual {
  kind: "photo" | "gradient";
  url?: string;
  initials: string;
  gradient: string;
}

const GRADIENTS = [
  "linear-gradient(135deg, #0b1f3a 0%, #1a3a5c 100%)",
  "linear-gradient(135deg, #1a3a5c 0%, #2d4a6b 100%)",
  "linear-gradient(135deg, #0b1f3a 0%, #123456 50%, #1a3a5c 100%)",
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function hotelInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "H";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function resolveHotelHeroVisual(hotel: RankedHotelSearchResult): HotelHeroVisual {
  const photo = hotel.photos.find((url) => typeof url === "string" && /^https?:\/\//i.test(url.trim()));
  const initials = hotelInitials(hotel.name);
  if (photo) {
    return { kind: "photo", url: photo.trim(), initials, gradient: GRADIENTS[0] };
  }
  const gradient = GRADIENTS[hashSeed(hotel.id) % GRADIENTS.length];
  return { kind: "gradient", initials, gradient };
}

export function formatHotelNightlyPrice(
  hotel: Pick<RankedHotelSearchResult, "browseOnly" | "bookOfferId" | "pricePerNight">,
): string {
  if (hotel.browseOnly) return "Check site";
  const nightly = hotel.pricePerNight;
  if (!Number.isFinite(nightly) || nightly <= 0) return "Check site";
  if (hasKepiBookableLiveRate(hotel)) return `$${Math.round(nightly)}`;
  if (hasDisplayNightlyRate(hotel)) return `From $${Math.round(nightly)}`;
  return "Check site";
}

export function formatHotelNightlyPriceCaption(
  hotel: Pick<RankedHotelSearchResult, "browseOnly" | "bookOfferId" | "pricePerNight" | "rateRoomName">,
): string {
  if (hasKepiBookableLiveRate(hotel)) {
    const room = hotel.rateRoomName?.trim();
    return room ? `/ night · ${room}` : "/ night · Kepi live rate";
  }
  if (hasDisplayNightlyRate(hotel)) return "/ night · verify before booking";
  return "See booking site";
}

export function formatHotelTotalPrice(
  hotel: Pick<RankedHotelSearchResult, "browseOnly" | "bookOfferId" | "totalPrice" | "nights">,
): string {
  if (hotel.browseOnly || !hasDisplayNightlyRate(hotel)) return "";
  const total = hotel.totalPrice;
  if (!Number.isFinite(total) || total <= 0) return "";
  const nights = hotel.nights > 0 ? hotel.nights : 1;
  return `$${Math.round(total)} total · ${nights} night${nights === 1 ? "" : "s"}`;
}

/** LAW 4 — safe strings for UI; never undefined/NaN/empty primary price. */
export function assertSafeHotelPriceLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  if (/undefined|null/i.test(trimmed)) return false;
  if (/nan/i.test(trimmed)) return false;
  return true;
}

export function primaryMatchReason(hotel: RankedHotelSearchResult): string {
  if (hotel.whyLine?.trim()) return hotel.whyLine.trim();
  if (hotel.cancellable) return "Free cancellation";
  if (hotel.tier === "kepi_pick" || hotel.tier === "personal") return "Top Kepi match for this search";
  if (hotel.fitScore >= 70) return "Best rated nearby";
  if (hotel.chainName) return `Matches your ${hotel.chainName} preference`;
  return "Strong fit for your trip";
}

export function topAmenityIcons(amenities: string[]): string[] {
  const icons: string[] = [];
  const haystack = amenities.join(" ").toLowerCase();
  if (/wifi|internet/.test(haystack)) icons.push("wifi");
  if (/breakfast/.test(haystack)) icons.push("breakfast");
  if (/parking|garage/.test(haystack)) icons.push("parking");
  if (/pool|swim/.test(haystack)) icons.push("pool");
  if (/gym|fitness/.test(haystack)) icons.push("gym");
  if (/elevator|lift|accessible/.test(haystack)) icons.push("elevator");
  return icons.slice(0, 3);
}
