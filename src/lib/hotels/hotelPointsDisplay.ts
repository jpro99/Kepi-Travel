import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import { bestHotelProgramForChain } from "@/lib/hotels/hotelPointsEstimate";
import { formatHotelNightlyPrice } from "@/lib/hotels/hotelCardDisplay";
import { hasDisplayNightlyRate } from "@/lib/hotels/hotelLiveRate";

export type HotelPayMode = "any" | "cash" | "points";

export function formatPointsShort(points: number): string {
  if (points >= 10_000) return `${Math.round(points / 1000)}k`;
  if (points >= 1000) return `${(points / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(points));
}

export function pointsPerNight(hotel: RankedHotelSearchResult): number | null {
  const option = hotel.pointsOption;
  if (!option || option.milesNeeded <= 0 || hotel.nights <= 0) return null;
  return Math.round(option.milesNeeded / hotel.nights);
}

export function resolveHotelMapPinLabel(
  hotel: RankedHotelSearchResult,
  payMode: HotelPayMode,
): { text: string; title: string } {
  const hasLiveRate = hasDisplayNightlyRate(hotel);
  const nightlyPts = pointsPerNight(hotel);
  const program = hotel.pointsOption?.programName ?? bestHotelProgramForChain(hotel.chainName, hotel.name)?.shortName;
  const nightlyLabel = formatHotelNightlyPrice(hotel);

  if (payMode === "points" && nightlyPts) {
    const suffix = program ? ` ${program}` : " pts";
    return {
      text: formatPointsShort(nightlyPts),
      title: `${hotel.name} · ~${nightlyPts.toLocaleString()} pts/night${program ? ` (${program})` : ""}`,
    };
  }

  if (payMode === "points" && !hasLiveRate) {
    return { text: "Pts", title: `${hotel.name} · check points on chain site` };
  }

  if (payMode === "any" && nightlyPts && hasLiveRate) {
    return {
      text: nightlyLabel.startsWith("$") || nightlyLabel.startsWith("From") ? nightlyLabel.replace("From ", "") : nightlyLabel,
      title: `${hotel.name} · ${nightlyLabel}/night · ~${nightlyPts.toLocaleString()} pts/night`,
    };
  }

  if (hasLiveRate) {
    return {
      text: nightlyLabel.replace("From ", ""),
      title: `${hotel.name} · ${nightlyLabel}/night`,
    };
  }

  return { text: "G", title: `${hotel.name} · check price on Google` };
}
