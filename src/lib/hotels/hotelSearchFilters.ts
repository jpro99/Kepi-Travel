import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import { hasDisplayNightlyRate } from "@/lib/hotels/hotelLiveRate";

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

export type FilterRelaxation = "none" | "style" | "price" | "all";

export interface ResolvedHotelDisplay {
  visible: RankedHotelSearchResult[];
  hidden: Array<{ hotel: RankedHotelSearchResult; evaluation: HotelMatchEvaluation }>;
  relaxedNote: string | null;
  relaxation: FilterRelaxation;
}

export function computeLivePriceBounds(hotels: RankedHotelSearchResult[]): PriceBounds {
  const nightlies = hotels
    .filter((hotel) => hasDisplayNightlyRate(hotel))
    .map((hotel) => Math.round(hotel.pricePerNight));

  if (nightlies.length === 0) {
    return { min: 0, max: 500, hasLiveRates: false };
  }

  const min = Math.min(...nightlies);
  const max = Math.max(...nightlies);
  return { min, max: Math.max(min + 1, max), hasLiveRates: true };
}

export function isPriceFilterNarrowed(
  priceMin: number,
  priceMax: number,
  catalog: { min: number; max: number },
): boolean {
  return priceMin > catalog.min || priceMax < catalog.max;
}

function hotelHaystack(hotel: RankedHotelSearchResult): string {
  return `${hotel.name} ${hotel.address} ${hotel.city} ${hotel.amenities.join(" ")}`.toLowerCase();
}

function profileHasHardPreferences(profile: HotelStayProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.requiresElevator ||
    profile.avoidStairs ||
    profile.prefersNearTransit ||
    profile.prefersOceanView ||
    profile.prefersBreakfast === "required" ||
    profile.qualityFloor === "high" ||
    profile.qualityFloor === "luxury"
  );
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

  if (hasDisplayNightlyRate(hotel)) {
    const nightly = Math.round(hotel.pricePerNight);
    if (nightly >= priceMin && nightly <= priceMax) {
      reasons.push(`$${nightly}/night fits your budget`);
    } else if (enforcePrice && priceNarrowed) {
      if (nightly < priceMin) blockers.push(`$${nightly}/night is below your $${priceMin} minimum`);
      if (nightly > priceMax) blockers.push(`$${nightly}/night is above your $${priceMax} maximum`);
    }
  } else if (enforcePrice && priceNarrowed) {
    blockers.push("No live rate — check the booking site for price");
  }

  if (profile && enforceProfile && profileHasHardPreferences(profile)) {
    if (profile.requiresElevator || profile.avoidStairs) {
      if (/elevator|lift|accessible|ground floor|no stairs/.test(haystack)) {
        reasons.push("Elevator or accessible access");
      } else if (/walk-up|stairs|no elevator|upper floor|without elevator/.test(haystack)) {
        blockers.push("May require stairs — you asked for elevator / no luggage upstairs");
      }
    }

    if (profile.prefersNearTransit) {
      if (/metro|subway|train|transit|rail|station/.test(haystack)) {
        reasons.push("Near transit");
      } else {
        blockers.push("Not flagged near train/metro — you prefer transit access");
      }
    }

    if (profile.prefersOceanView) {
      if (/ocean|beach|sea|waterfront|coast|harbor|seaside/.test(haystack)) {
        reasons.push("Near the water");
      } else {
        blockers.push("Not clearly near the water");
      }
    }

    if (profile.prefersBreakfast === "required") {
      if (/breakfast/.test(haystack)) reasons.push("Breakfast available");
      else blockers.push("Breakfast not listed — you want it included");
    }

    const minStars =
      profile.qualityFloor === "luxury" ? 4.5 : profile.qualityFloor === "high" ? 4 : 2;
    const review = hotel.rating ?? hotel.stars;
    if (profile.qualityFloor === "high" || profile.qualityFloor === "luxury") {
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

function styleProximityScore(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null,
  priceMin: number,
  priceMax: number,
  catalog: { min: number; max: number },
): number {
  const evaluation = evaluateHotelMatch(hotel, profile, priceMin, priceMax, {
    enforceProfile: true,
    enforcePrice: false,
    catalogMin: catalog.min,
    catalogMax: catalog.max,
  });
  return evaluation.reasons.length * 12 - evaluation.blockers.length * 8 + hotel.fitScore + (1000 - hotel.rank);
}

function sortByStyleProximity(
  hotels: RankedHotelSearchResult[],
  profile: HotelStayProfile | null,
  priceMin: number,
  priceMax: number,
  catalog: { min: number; max: number },
): RankedHotelSearchResult[] {
  return [...hotels].sort(
    (a, b) =>
      styleProximityScore(b, profile, priceMin, priceMax, catalog) -
      styleProximityScore(a, profile, priceMin, priceMax, catalog),
  );
}

function passesWithOptions(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null,
  priceMin: number,
  priceMax: number,
  catalog: { min: number; max: number },
  enforceProfile: boolean,
  enforcePrice: boolean,
): boolean {
  return evaluateHotelMatch(hotel, profile, priceMin, priceMax, {
    enforceProfile,
    enforcePrice,
    catalogMin: catalog.min,
    catalogMax: catalog.max,
  }).passes;
}

/**
 * LAW 2 + LAW 5 — Apply filters with automatic relaxation when inventory would disappear.
 * Style hard-filters only run when strictStyleFilter is true (user tapped Refine → Apply).
 */
export function resolveHotelDisplay(
  hotels: RankedHotelSearchResult[],
  options: {
    profile: HotelStayProfile | null;
    priceMin: number;
    priceMax: number;
    catalogBounds: PriceBounds;
    strictStyleFilter: boolean;
  },
): ResolvedHotelDisplay {
  const { profile, priceMin, priceMax, catalogBounds, strictStyleFilter } = options;
  const catalog = { min: catalogBounds.min, max: catalogBounds.max };
  const priceNarrowed = isPriceFilterNarrowed(priceMin, priceMax, catalog);

  if (hotels.length === 0) {
    return { visible: [], hidden: [], relaxedNote: null, relaxation: "none" };
  }

  let enforceProfile = strictStyleFilter;
  let enforcePrice = priceNarrowed;
  let visible = hotels.filter((hotel) =>
    passesWithOptions(hotel, profile, priceMin, priceMax, catalog, enforceProfile, enforcePrice),
  );

  let relaxation: FilterRelaxation = "none";
  let relaxedNote: string | null = null;

  if (visible.length === 0) {
    if (strictStyleFilter) {
      visible = hotels.filter((hotel) =>
        passesWithOptions(hotel, profile, priceMin, priceMax, catalog, false, enforcePrice),
      );
      if (visible.length > 0) {
        relaxation = "style";
        relaxedNote = `Showing all ${visible.length} — none matched your exact stay style, ranked closest first.`;
      }
    }

    if (visible.length === 0 && priceNarrowed) {
      visible = hotels.filter((hotel) =>
        passesWithOptions(hotel, profile, priceMin, priceMax, catalog, false, false),
      );
      if (visible.length > 0) {
        relaxation = "price";
        relaxedNote = `Showing all ${visible.length} — none matched your budget, ranked closest first.`;
      }
    }

    if (visible.length === 0) {
      visible = [...hotels];
      relaxation = "all";
      relaxedNote = `Showing all ${hotels.length} — none matched your filters, ranked closest first.`;
    }

    visible = sortByStyleProximity(visible, profile, priceMin, priceMax, catalog);
  }

  const visibleIds = new Set(visible.map((hotel) => hotel.id));
  const hidden =
    relaxation === "none"
      ? hotels
          .filter((hotel) => !visibleIds.has(hotel.id))
          .map((hotel) => ({
            hotel,
            evaluation: evaluateHotelMatch(hotel, profile, priceMin, priceMax, {
              enforceProfile: strictStyleFilter,
              enforcePrice: priceNarrowed,
              catalogMin: catalog.min,
              catalogMax: catalog.max,
            }),
          }))
      : [];

  return { visible, hidden, relaxedNote, relaxation };
}

/** @deprecated Use resolveHotelDisplay — kept for narrow call sites. */
export function hotelPassesFilters(
  hotel: RankedHotelSearchResult,
  profile: HotelStayProfile | null | undefined,
  priceMin: number,
  priceMax: number,
  catalogBounds?: { min: number; max: number },
): boolean {
  const catalog = catalogBounds ?? { min: priceMin, max: priceMax };
  return passesWithOptions(
    hotel,
    profile ?? null,
    priceMin,
    priceMax,
    catalog,
    false,
    isPriceFilterNarrowed(priceMin, priceMax, catalog),
  );
}

export { profileHasHardPreferences };
