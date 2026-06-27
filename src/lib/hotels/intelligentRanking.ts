import type { HotelStayMemory } from "@/lib/memory/hotelMemory";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import type { TravelerGenome } from "@/lib/traveler/types";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";
import { estimateHotelPointsOptions } from "@/lib/hotels/hotelPointsEstimate";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";

function chainMatchScore(chainName: string | undefined, hotelName: string, priorities: string[]): number {
  const haystack = `${chainName ?? ""} ${hotelName}`.toLowerCase();
  for (let index = 0; index < priorities.length; index++) {
    const needle = priorities[index].toLowerCase().trim();
    if (needle && haystack.includes(needle)) {
      return (priorities.length - index) * 8;
    }
  }
  return 0;
}

function memoryChainBoost(memory: HotelStayMemory, chainName: string | undefined, hotelName: string): number {
  const haystack = `${chainName ?? ""} ${hotelName}`.toLowerCase();
  let boost = 0;
  for (const entry of memory.preferredChains) {
    if (haystack.includes(entry.name.toLowerCase())) {
      boost += entry.weight * 0.35;
    }
  }
  for (const avoided of memory.avoidedChains) {
    if (haystack.includes(avoided.toLowerCase())) {
      boost -= 20;
    }
  }
  return boost;
}

function transitBoost(amenities: string[], memory: HotelStayMemory): number {
  const haystack = amenities.join(" ").toLowerCase();
  const signals =
    /metro|subway|train|transit|rail|bus|city center|central|downtown/.test(haystack) ||
    amenities.some((entry) => entry.toLowerCase().includes("location"));
  if (!signals) return 0;
  if (memory.prefersNearTransit || memory.prefersCentralArea) return 12;
  return 4;
}

function qualityScore(hotel: HotelSearchResult): number {
  const review = hotel.rating ?? 0;
  const stars = hotel.stars ?? 3;
  return review * 8 + stars * 6;
}

function valueScore(hotel: HotelSearchResult, minNightly: number, spread: number): number {
  if (spread <= 0) return 20;
  return 20 * (1 - (hotel.pricePerNight - minNightly) / spread);
}

function pickTier(args: {
  index: number;
  isKepiPick: boolean;
  isBestValue: boolean;
  isBestQuality: boolean;
  isPointsPlay: boolean;
  personalBoost: number;
}): RankedHotelSearchResult["tier"] {
  if (args.isKepiPick) return "kepi_pick";
  if (args.isPointsPlay) return "points_play";
  if (args.personalBoost >= 12 && args.index < 3) return "personal";
  if (args.isBestValue) return "best_value";
  if (args.isBestQuality) return "best_quality";
  return "solid";
}

function chainGroupKey(hotel: HotelSearchResult): string {
  const chain = hotel.chainName?.trim().toLowerCase();
  if (chain) return chain;
  if (/masseria|trullo|boutique|b&b|guesthouse|inn|apartment|palazzo/i.test(hotel.name)) {
    return "independent";
  }
  return "other";
}

/** Keep Kepi Pick smart but surface chain variety — not three of the same brand. */
function diversifyRankedResults(results: RankedHotelSearchResult[]): RankedHotelSearchResult[] {
  if (results.length <= 4) return results;

  const picked: RankedHotelSearchResult[] = [];
  const usedIds = new Set<string>();
  const chainCounts = new Map<string, number>();

  const tryAdd = (hotel: RankedHotelSearchResult, maxPerChain = 2): boolean => {
    if (usedIds.has(hotel.id)) return false;
    const key = chainGroupKey(hotel);
    const count = chainCounts.get(key) ?? 0;
    if (count >= maxPerChain) return false;
    picked.push(hotel);
    usedIds.add(hotel.id);
    chainCounts.set(key, count + 1);
    return true;
  };

  if (results[0]) tryAdd(results[0], 1);

  const bestValue = results.find((row) => row.tier === "best_value" || row.badges.includes("Best value"));
  const bestQuality = results.find((row) => row.tier === "best_quality" || row.badges.includes("Top quality"));
  const pointsPlay = results.find((row) => row.tier === "points_play");
  if (bestValue) tryAdd(bestValue);
  if (bestQuality) tryAdd(bestQuality);
  if (pointsPlay) tryAdd(pointsPlay);

  for (const row of results) {
    if (picked.length >= 50) break;
    tryAdd(row);
  }

  const total = picked.length;
  return picked.map((row, index) => ({
    ...row,
    rank: index + 1,
    cityRankLabel:
      index === 0
        ? "#1 for your search"
        : index < Math.ceil(total * 0.25)
          ? `Top ${Math.min(25, Math.round(((index + 1) / total) * 100))}% in city`
          : index < Math.ceil(total * 0.5)
            ? "Mid-range for this search"
            : "Further from top picks",
  }));
}

function stayProfileBoost(
  profile: HotelStayProfile | null | undefined,
  hotel: HotelSearchResult,
): { boost: number; badges: string[] } {
  if (!profile?.completed && !profile?.freeTextSummary?.trim()) {
    return { boost: 0, badges: [] };
  }

  const haystack = `${hotel.name} ${hotel.address} ${hotel.city} ${hotel.amenities.join(" ")}`.toLowerCase();
  let boost = 0;
  const badges: string[] = [];

  if (profile.requiresElevator || profile.avoidStairs) {
    if (/elevator|lift|accessible|ground floor|no stairs/.test(haystack)) {
      boost += 14;
      badges.push("Elevator");
    } else if (/walk-up|stairs|no elevator/.test(haystack)) {
      boost -= 18;
    }
  }

  if (profile.prefersBalcony && /balcony|terrace|patio/.test(haystack)) {
    boost += 8;
    badges.push("Balcony");
  }

  if (profile.prefersOceanView && /ocean|beach|sea|waterfront|coast|harbor|seaside/.test(haystack)) {
    boost += 10;
    badges.push("Near water");
  }

  if (profile.prefersNearTransit && /metro|subway|train|transit|rail|station/.test(haystack)) {
    boost += 8;
    badges.push("Near transit");
  }

  if (profile.prefersBreakfast !== "dont_care" && /breakfast/.test(haystack)) {
    boost += profile.prefersBreakfast === "required" ? 12 : 6;
    badges.push("Breakfast");
  }

  const minStars =
    profile.qualityFloor === "luxury" ? 4.5 : profile.qualityFloor === "high" ? 4 : profile.qualityFloor === "budget" ? 2 : 3;
  const review = hotel.rating ?? hotel.stars;
  if (review >= minStars) {
    boost += profile.qualityFloor === "luxury" || profile.qualityFloor === "high" ? 6 : 3;
  } else if (profile.qualityFloor === "high" || profile.qualityFloor === "luxury") {
    boost -= 6;
  }

  return { boost, badges: badges.slice(0, 3) };
}

export function rankHotelSearchResults(input: {
  hotels: HotelSearchResult[];
  genome: TravelerGenome;
  memory: HotelStayMemory;
  loyaltyBalances: LoyaltyBalance[];
  stayProfile?: HotelStayProfile | null;
}): RankedHotelSearchResult[] {
  const { hotels, genome, memory, loyaltyBalances, stayProfile } = input;
  if (hotels.length === 0) return [];

  const nightlies = hotels.map((hotel) => hotel.pricePerNight).filter((value) => value > 0);
  const minNightly = Math.min(...nightlies);
  const maxNightly = Math.max(...nightlies);
  const spread = Math.max(1, maxNightly - minNightly);

  const chainPriority = [
    ...memory.preferredChains.sort((a, b) => b.weight - a.weight).map((entry) => entry.name),
    ...genome.hotelChainPriority,
  ];

  const scored = hotels.map((hotel) => {
    const quality = qualityScore(hotel);
    const value = valueScore(hotel, minNightly, spread);
    const loyalty = chainMatchScore(hotel.chainName, hotel.name, chainPriority);
    const learned = memoryChainBoost(memory, hotel.chainName, hotel.name);
    const transit = transitBoost(hotel.amenities, memory);
    const profileMatch = stayProfileBoost(stayProfile, hotel);
    const bias = memory.valueVsQualityBias;
    const weightedQuality = quality * (1 + Math.max(0, bias) * 0.35);
    const weightedValue = value * (1 + Math.max(0, -bias) * 0.35);

    let comfortPenalty = 0;
    if (memory.typicalNightlyUsd && hotel.pricePerNight > memory.typicalNightlyUsd * 1.45) {
      comfortPenalty = 8;
    }

    const pointsOptions = estimateHotelPointsOptions(
      hotel.totalPrice,
      hotel.chainName,
      hotel.name,
      loyaltyBalances,
    );
    const bestPoints = pointsOptions.find((option) => option.recommendation === "use") ?? pointsOptions[0];
    const pointsBoost = bestPoints?.recommendation === "use" ? 10 + bestPoints.cppAchieved * 0.5 : 0;

    const fitScore = Math.round(
      weightedQuality + weightedValue + loyalty + learned + transit + profileMatch.boost + pointsBoost - comfortPenalty,
    );

    return {
      hotel,
      quality,
      value,
      fitScore,
      bestPoints,
      personalBoost: learned + loyalty + profileMatch.boost,
      profileBadges: profileMatch.badges,
    };
  });

  scored.sort((a, b) => b.fitScore - a.fitScore);

  const bestValueId = [...hotels].sort((a, b) => a.pricePerNight / Math.max(1, qualityScore(a)) - b.pricePerNight / Math.max(1, qualityScore(b)))[0]?.id;
  const bestQualityId = [...hotels].sort((a, b) => qualityScore(b) - qualityScore(a))[0]?.id;
  const pointsPlayId = scored.find((entry) => entry.bestPoints?.recommendation === "use")?.hotel.id;

  const ranked = scored.map((entry, index) => {
    const { hotel, fitScore, bestPoints, personalBoost, quality, value, profileBadges } = entry;
    const isKepiPick = index === 0;
    const isBestValue = hotel.id === bestValueId;
    const isBestQuality = hotel.id === bestQualityId;
    const isPointsPlay = hotel.id === pointsPlayId;

    const tier = pickTier({
      index,
      isKepiPick,
      isBestValue,
      isBestQuality,
      isPointsPlay,
      personalBoost,
    });

    const badges: string[] = [];
    if (isKepiPick) badges.push("Kepi Pick");
    if (isBestValue && !isKepiPick) badges.push("Best value");
    if (isBestQuality && !isKepiPick) badges.push("Top quality");
    if (bestPoints?.recommendation === "use") badges.push(`${bestPoints.cppAchieved.toFixed(1)}¢/pt`);
    if (personalBoost >= 12) badges.push("Matches you");
    for (const badge of profileBadges ?? []) {
      if (!badges.includes(badge)) badges.push(badge);
    }

    const ratingLabel =
      hotel.rating !== undefined
        ? `${hotel.rating.toFixed(1)} guest score`
        : `${hotel.stars}★`;

    let whyLine = `${ratingLabel} · $${Math.round(hotel.pricePerNight)}/night`;
    if (isKepiPick) {
      whyLine = `Best overall deal for what you get — ${whyLine}`;
    } else if (tier === "points_play" && bestPoints) {
      whyLine = `Best points play — ${bestPoints.reason}`;
    } else if (tier === "personal") {
      whyLine = `Matches your stay style — ${whyLine}`;
    } else if (isBestValue) {
      whyLine = `Lowest price for this quality tier — ${whyLine}`;
    } else if (isBestQuality) {
      whyLine = `Highest quality in this search — ${whyLine}`;
    }

    return {
      ...hotel,
      rank: index + 1,
      fitScore,
      tier,
      whyLine,
      badges,
      qualityScore: Math.round(quality),
      valueScore: Math.round(value),
      pointsOption: bestPoints,
      cityRankLabel: undefined,
    };
  });

  return diversifyRankedResults(ranked);
}
