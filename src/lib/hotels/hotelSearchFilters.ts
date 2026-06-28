import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

export interface HotelMatchEvaluation {
  passes: boolean;
  reasons: string[];
  blockers: string[];
}

export interface PriceBounds {
  min: number;
  max: number;
  hasLiveRates: boolean;
}

export function computeLivePriceBounds(hotels: RankedHotelSearchResult[]): PriceBounds {
  const nightlies = hotels
    .filter((hotel) => !hotel.browseOnly && hotel.pricePerNight > 0)
    .map((hotel) => Math.round(hotel.pricePerNight));

  if (nightlies.length === 0) {
    return { min: 0, max: 500, hasLiveRates: false };
  }

  const min = Math.min(...nightlies);
  const max = Math.max(...nightlies);
  return { min, max: Math.max(min + 1, max), hasLiveRates: true };
}

function hotelHaystack(hotel: RankedHotelSearchResult): string {
  return `${hotel.name} ${hotel.address} ${hotel.city} ${hotel.amenities.join(" ")}`.toLowerCase();
}

/** Explain why a hotel does or doesn't fit the traveler's stay style + budget. */
export function evaluateHotelMatch(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null | undefined,
  priceMin: number,
  priceMax: number,
  options?: {
    enforcePrice?: boolean;
    enforceProfile?: boolean;
    catalogMin?: number;
    catalogMax?: number;
  },
): HotelMatchEvaluation {
  const enforcePrice = options?.enforcePrice ?? true;
  const enforceProfile = options?.enforceProfile ?? true;
  const catalogMin = options?.catalogMin ?? priceMin;
  const catalogMax = options?.catalogMax ?? priceMax;
  const priceNarrowed = priceMin > catalogMin || priceMax < catalogMax;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const haystack = hotelHaystack(hotel);

  if (!hotel.browseOnly && hotel.pricePerNight > 0) {
    const nightly = Math.round(hotel.pricePerNight);
    if (nightly >= priceMin && nightly <= priceMax) {
      reasons.push(`$${nightly}/night fits your budget`);
    } else if (enforcePrice) {
      if (nightly < priceMin) blockers.push(`$${nightly}/night is below your $${priceMin} minimum`);
      if (nightly > priceMax) blockers.push(`$${nightly}/night is above your $${priceMax} maximum`);
    }
  } else if (enforcePrice && priceNarrowed) {
    blockers.push("No live rate — check the booking site for price");
  }

  if (profile && enforceProfile) {
    const profileActive =
      profile.completed ||
      profile.requiresElevator ||
      profile.avoidStairs ||
      profile.prefersNearTransit ||
      profile.prefersOceanView ||
      profile.prefersBreakfast === "required" ||
      profile.qualityFloor === "high" ||
      profile.qualityFloor === "luxury";

    if ((profile.requiresElevator || profile.avoidStairs) && profileActive) {
      if (/elevator|lift|accessible|ground floor|no stairs/.test(haystack)) {
        reasons.push("Elevator or accessible access");
      } else if (/walk-up|stairs|no elevator|upper floor|without elevator/.test(haystack)) {
        blockers.push("May require stairs — you asked for elevator / no luggage upstairs");
      }
    }

    if (profile.prefersNearTransit && profileActive) {
      if (/metro|subway|train|transit|rail|station/.test(haystack)) {
        reasons.push("Near transit");
      } else if (profile.completed) {
        blockers.push("Not flagged near train/metro — you prefer transit access");
      }
    }

    if (profile.prefersOceanView && profileActive) {
      if (/ocean|beach|sea|waterfront|coast|harbor|seaside/.test(haystack)) {
        reasons.push("Near the water");
      } else if (profile.completed) {
        blockers.push("Not clearly near the water");
      }
    }

    if (profile.prefersBreakfast === "required" && profileActive) {
      if (/breakfast/.test(haystack)) reasons.push("Breakfast available");
      else if (profile.completed) blockers.push("Breakfast not listed — you want it included");
    }

    const minStars =
      profile.qualityFloor === "luxury" ? 4.5 : profile.qualityFloor === "high" ? 4 : profile.qualityFloor === "budget" ? 2 : 3;
    const review = hotel.rating ?? hotel.stars;
    if ((profile.qualityFloor === "high" || profile.qualityFloor === "luxury") && profileActive) {
      if (review >= minStars) reasons.push("Meets your quality bar");
      else blockers.push(`Rating ${review.toFixed(1)}★ below your ${minStars}★ floor`);
    }
  }

  if (hotel.tier === "kepi_pick" || hotel.tier === "personal") {
    reasons.push("Top Kepi match for this search");
  } else if (hotel.fitScore >= 70) {
    reasons.push("Strong fit score for your trip");
  }

  if (hotel.whyLine) reasons.push(hotel.whyLine);

  const passes = blockers.length === 0;
  return {
    passes,
    reasons: [...new Set(reasons)].slice(0, 4),
    blockers: [...new Set(blockers)],
  };
}

export function hotelPassesFilters(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null | undefined,
  priceMin: number,
  priceMax: number,
  catalogBounds?: { min: number; max: number },
): boolean {
  return evaluateHotelMatch(hotel, profile, priceMin, priceMax, {
    catalogMin: catalogBounds?.min,
    catalogMax: catalogBounds?.max,
  }).passes;
}
