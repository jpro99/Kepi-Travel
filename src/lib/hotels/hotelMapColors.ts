import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import { resolveHotelChainMapColor } from "@/lib/hotels/hotelChainDisplay";

export interface HotelMapColorStyle {
  bg: string;
  text: string;
  ring: string;
  /** Chain or independent bucket */
  label: string;
  /** Fit quality when user needs both chain + match context */
  fitLabel: "Top match" | "Good fit" | "Other" | null;
}

export function fitScoreRange(hotels: RankedHotelSearchResult[]): { min: number; max: number } {
  if (hotels.length === 0) return { min: 0, max: 1 };
  const scores = hotels.map((hotel) => hotel.fitScore);
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

function isStrongMatch(
  hotel: RankedHotelSearchResult,
  range: { min: number; max: number },
): boolean {
  const span = Math.max(1, range.max - range.min);
  const ratio = (hotel.fitScore - range.min) / span;
  return (
    hotel.tier === "kepi_pick" ||
    hotel.tier === "personal" ||
    hotel.tier === "points_play" ||
    hotel.badges.includes("Matches you") ||
    hotel.badges.some((badge) => /your chain|hyatt|marriott|hilton|ihg/i.test(badge)) ||
    ratio >= 0.62
  );
}

function isGoodFit(hotel: RankedHotelSearchResult, range: { min: number; max: number }): boolean {
  const span = Math.max(1, range.max - range.min);
  const ratio = (hotel.fitScore - range.min) / span;
  return ratio >= 0.35;
}

export function hotelMapPinStyle(
  hotel: RankedHotelSearchResult,
  range: { min: number; max: number },
): HotelMapColorStyle {
  const chainColor = resolveHotelChainMapColor(hotel.chainName, hotel.name);
  const strongMatch = isStrongMatch(hotel, range);
  const goodFit = isGoodFit(hotel, range);

  return {
    bg: chainColor.bg,
    text: chainColor.text,
    ring: strongMatch ? "#f4c95d" : goodFit ? "#ffffff" : "#e2e8f0",
    label: chainColor.label,
    fitLabel: strongMatch ? "Top match" : goodFit ? "Good fit" : "Other",
  };
}
