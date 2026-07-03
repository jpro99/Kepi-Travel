import type { HotelChainId } from "@/lib/loyalty/chainRegistry";
import { matchHotelChain } from "@/lib/loyalty/chainRegistry";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

export type HotelMapPinCategory = "your_chain" | "other_chain" | "independent";

export interface HotelMapColorStyle {
  bg: string;
  text: string;
  ring: string;
  label: "Your program" | "Other chain" | "Independent";
  category: HotelMapPinCategory;
}

export interface HotelMapPinStyleOptions {
  preferredChainIds?: HotelChainId[];
}

export function fitScoreRange(hotels: RankedHotelSearchResult[]): { min: number; max: number } {
  if (hotels.length === 0) return { min: 0, max: 1 };
  const scores = hotels.map((hotel) => hotel.fitScore);
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

export function hotelMapPinCategory(
  hotel: RankedHotelSearchResult,
  preferredChainIds: HotelChainId[] = [],
): HotelMapPinCategory {
  const chainId = matchHotelChain(hotel.chainName, hotel.name);
  if (!chainId) return "independent";
  if (preferredChainIds.includes(chainId)) return "your_chain";
  return "other_chain";
}

export function hotelMapPinStyle(
  hotel: RankedHotelSearchResult,
  options: HotelMapPinStyleOptions = {},
): HotelMapColorStyle {
  const category = hotelMapPinCategory(hotel, options.preferredChainIds ?? []);

  if (category === "your_chain") {
    return {
      bg: "#0b1f3a",
      text: "#f4c95d",
      ring: "#f4c95d",
      label: "Your program",
      category,
    };
  }
  if (category === "other_chain") {
    return {
      bg: "#475569",
      text: "#ffffff",
      ring: "#94a3b8",
      label: "Other chain",
      category,
    };
  }
  return {
    bg: "#ea580c",
    text: "#ffffff",
    ring: "#fdba74",
    label: "Independent",
    category,
  };
}
