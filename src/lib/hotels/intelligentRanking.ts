import type { HotelStayMemory } from "@/lib/memory/hotelMemory";
import type { TravelerGenome } from "@/lib/traveler/types";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";
import { estimateHotelPointsOptions } from "@/lib/hotels/hotelPointsEstimate";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";

function chainMatchScore(chainName: string | undefined, hotelName: string, priorities: string[]): number {
  const haystack = `${chainName ?? ""} ${hotelName}`.toLowerCase();
  for (let index = 0; index < priorities.length; index++) {
    const needle = priorities[index].toLowerCase().trim();
    if (needle && haystack.includes(needle)) {
      return (priorities.length - index) * 14;
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

export function rankHotelSearchResults(input: {
  hotels: HotelSearchResult[];
  genome: TravelerGenome;
  memory: HotelStayMemory;
  loyaltyBalances: LoyaltyBalance[];
}): RankedHotelSearchResult[] {
  const { hotels, genome, memory, loyaltyBalances } = input;
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

    const fitScore = Math.round(weightedQuality + weightedValue + loyalty + learned + transit + pointsBoost - comfortPenalty);

    return {
      hotel,
      quality,
      value,
      fitScore,
      bestPoints,
      personalBoost: learned + loyalty,
    };
  });

  scored.sort((a, b) => b.fitScore - a.fitScore);

  const bestValueId = [...hotels].sort((a, b) => a.pricePerNight / Math.max(1, qualityScore(a)) - b.pricePerNight / Math.max(1, qualityScore(b)))[0]?.id;
  const bestQualityId = [...hotels].sort((a, b) => qualityScore(b) - qualityScore(a))[0]?.id;
  const pointsPlayId = scored.find((entry) => entry.bestPoints?.recommendation === "use")?.hotel.id;

  return scored.map((entry, index) => {
    const { hotel, fitScore, bestPoints, personalBoost, quality, value } = entry;
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
    };
  });
}
