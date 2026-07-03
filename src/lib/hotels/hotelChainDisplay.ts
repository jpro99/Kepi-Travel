import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import {
  HOTEL_CHAINS,
  matchHotelChain,
  type HotelChainId,
} from "@/lib/loyalty/chainRegistry";
import { pointsPerNight } from "@/lib/hotels/hotelPointsDisplay";

export interface HotelChainMapColor {
  bg: string;
  text: string;
  label: string;
}

export const HOTEL_CHAIN_MAP_COLORS: Record<HotelChainId, HotelChainMapColor> = {
  hyatt: { bg: "#5b21b6", text: "#ffffff", label: "Hyatt" },
  marriott: { bg: "#9f1239", text: "#ffffff", label: "Marriott" },
  hilton: { bg: "#1d4ed8", text: "#ffffff", label: "Hilton" },
  ihg: { bg: "#047857", text: "#ffffff", label: "IHG" },
};

export const INDEPENDENT_HOTEL_MAP_COLOR: HotelChainMapColor = {
  bg: "#64748b",
  text: "#ffffff",
  label: "Other",
};

export interface HotelChainPresentation {
  chainId: HotelChainId | null;
  chainLabel: string;
  programName: string | null;
  brandLine: string | null;
  pointsPerNight: number | null;
  participatesInPoints: boolean;
  mapColor: HotelChainMapColor;
}

export function resolveHotelChainMapColor(
  chainName?: string,
  hotelName?: string,
): HotelChainMapColor {
  const chainId = matchHotelChain(chainName, hotelName);
  if (!chainId) return INDEPENDENT_HOTEL_MAP_COLOR;
  return HOTEL_CHAIN_MAP_COLORS[chainId];
}

export function resolveHotelChainPresentation(hotel: RankedHotelSearchResult): HotelChainPresentation {
  const chainId = matchHotelChain(hotel.chainName, hotel.name);
  const chainDef = chainId ? HOTEL_CHAINS.find((row) => row.id === chainId) : null;
  const nightlyPts = pointsPerNight(hotel);
  const brandLine = resolveHotelBrandLine(hotel.name, chainId);

  return {
    chainId,
    chainLabel: chainDef?.label ?? "Independent",
    programName: hotel.pointsOption?.programName ?? chainDef?.programName ?? null,
    brandLine,
    pointsPerNight: nightlyPts,
    participatesInPoints: chainId !== null,
    mapColor: resolveHotelChainMapColor(hotel.chainName, hotel.name),
  };
}

/** Surface sub-brand (e.g. Andaz, Hyatt Centric) when name is more specific than chain. */
export function resolveHotelBrandLine(hotelName: string, chainId: HotelChainId | null): string | null {
  const trimmed = hotelName.trim();
  if (!trimmed || !chainId) return null;

  const chainDef = HOTEL_CHAINS.find((row) => row.id === chainId);
  if (!chainDef) return trimmed;

  for (const matcher of chainDef.matchers) {
    const hit = trimmed.match(matcher);
    if (hit?.[0]) {
      const fragment = hit[0].trim();
      if (fragment.length >= 4 && !/^hyatt$|^marriott$|^hilton$|^ihg$/i.test(fragment)) {
        return trimmed;
      }
    }
  }

  return trimmed !== chainDef.label ? trimmed : null;
}
