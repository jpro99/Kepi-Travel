import { evaluateHotelMatch } from "@/lib/hotels/hotelSearchFilters";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

export interface HotelMatchSummary {
  headline: string;
  matches: string[];
  gaps: string[];
}

export function buildHotelMatchSummary(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null | undefined,
  totalInSearch: number,
): HotelMatchSummary {
  const evaluation = evaluateHotelMatch(hotel, profile, 0, 999_999, {
    enforcePrice: false,
    enforceProfile: Boolean(profile?.completed || profile?.freeTextSummary?.trim()),
  });

  let headline = "Solid option in this search";
  if (hotel.tier === "kepi_pick" || hotel.rank === 1) {
    headline = `Best overall — #1 of ${totalInSearch}`;
  } else if (hotel.tier === "personal" || hotel.badges.includes("Matches you")) {
    headline = `Top match for you — #${hotel.rank} of ${totalInSearch}`;
  } else if (hotel.tier === "points_play") {
    headline = "Best points play in this search";
  } else if (hotel.rank <= 3) {
    headline = `Top pick — #${hotel.rank} of ${totalInSearch}`;
  } else if (hotel.fitScore >= 70) {
    headline = `Strong fit — #${hotel.rank} of ${totalInSearch}`;
  } else if (hotel.rank > Math.max(3, Math.ceil(totalInSearch * 0.5))) {
    headline = `Lower in your ranked list — #${hotel.rank} of ${totalInSearch}`;
  }

  const matches = [
    ...hotel.badges.filter((badge) => !/^Kepi Pick$|^Nearby$/.test(badge)),
    ...evaluation.reasons.filter(
      (reason) => !/Top Kepi match|Strong fit score|Best overall|Best nearby/i.test(reason),
    ),
  ];

  return {
    headline,
    matches: [...new Set(matches)].slice(0, 4),
    gaps: evaluation.blockers.slice(0, 3),
  };
}
