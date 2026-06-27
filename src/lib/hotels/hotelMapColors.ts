import type { RankedHotelSearchResult } from "@/lib/hotels/types";

export interface HotelMapColorStyle {
  bg: string;
  text: string;
  ring: string;
  label: "Best match" | "Good fit" | "Other";
}

export function fitScoreRange(hotels: RankedHotelSearchResult[]): { min: number; max: number } {
  if (hotels.length === 0) return { min: 0, max: 1 };
  const scores = hotels.map((hotel) => hotel.fitScore);
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

export function hotelMapPinStyle(
  hotel: RankedHotelSearchResult,
  range: { min: number; max: number },
): HotelMapColorStyle {
  const span = Math.max(1, range.max - range.min);
  const ratio = (hotel.fitScore - range.min) / span;
  const strongMatch =
    hotel.tier === "kepi_pick" ||
    hotel.tier === "personal" ||
    hotel.badges.includes("Matches you") ||
    ratio >= 0.62;

  if (strongMatch) {
    return { bg: "#14532d", text: "#ffffff", ring: "#86efac", label: "Best match" };
  }
  if (ratio >= 0.35) {
    return { bg: "#f59e0b", text: "#1c1917", ring: "#fde68a", label: "Good fit" };
  }
  return { bg: "#ea580c", text: "#ffffff", ring: "#fdba74", label: "Other" };
}
