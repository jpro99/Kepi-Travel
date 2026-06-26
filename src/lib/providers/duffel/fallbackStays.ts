import { generateId } from "@/lib/utils/generateId";
import type { DuffelStayQuote } from "@/lib/providers/duffel/types";

export type StaysSearchSource = "duffel" | "estimated";

export function resolveStaysMode(): "live" | "mock" {
  const mode = process.env.DUFFEL_STAYS_MODE?.trim().toLowerCase();
  return mode === "mock" || mode === "estimated" ? "mock" : "live";
}

const REGION_NIGHTLY: Record<string, { min: number; max: number }> = {
  FCO: { min: 220, max: 380 },
  VCE: { min: 240, max: 420 },
  BRI: { min: 160, max: 280 },
  BDS: { min: 150, max: 260 },
  FLR: { min: 195, max: 320 },
  MXP: { min: 210, max: 350 },
  CDG: { min: 240, max: 420 },
  NRT: { min: 260, max: 440 },
  HND: { min: 270, max: 460 },
  LHR: { min: 250, max: 430 },
  HNL: { min: 320, max: 520 },
  SEA: { min: 165, max: 290 },
  LAX: { min: 175, max: 310 },
  ONT: { min: 130, max: 210 },
};

const CHAIN_HOTELS: Record<string, (city: string) => string[]> = {
  Hyatt: (city) => [`Hyatt Centric ${city}`, `Park Hyatt ${city}`, `Hyatt Regency ${city}`],
  Marriott: (city) => [`Marriott ${city} Downtown`, `AC Hotel ${city}`, `The Ritz-Carlton ${city}`],
  Hilton: (city) => [`Hilton ${city}`, `Conrad ${city}`, `Waldorf Astoria ${city}`],
  IHG: (city) => [`InterContinental ${city}`, `Kimpton ${city}`, `Hotel Indigo ${city}`],
  Accor: (city) => [`Sofitel ${city}`, `Novotel ${city}`, `Fairmont ${city}`],
};

function nightlyForIndex(iata: string, index: number, spread: number): number {
  const region = REGION_NIGHTLY[iata.toUpperCase()] ?? { min: 180, max: 320 };
  const step = spread > 1 ? (region.max - region.min) / (spread - 1) : 0;
  return Math.round(region.min + step * index);
}

function boutiqueNames(city: string): Array<{ name: string; chainName?: string }> {
  return [
    { name: `${city} Boutique Hotel` },
    { name: `Central ${city} Inn` },
  ];
}

/**
 * Synthetic stay quotes when Duffel Stays is disabled, unconfigured, or empty.
 * Uses destination + traveler chain priority so ranking and carousel UX match live mode.
 */
export function buildEstimatedStays(input: {
  destinationIata: string;
  destinationCity: string;
  nights: number;
  chainPriority: string[];
}): DuffelStayQuote[] {
  const nights = Math.max(1, input.nights);
  const iata = input.destinationIata.toUpperCase();
  const city = input.destinationCity.trim() || iata;
  const chains = input.chainPriority.filter(Boolean).slice(0, 3);

  const candidates: Array<{ name: string; chainName?: string }> = [];
  for (const chain of chains) {
    const names = CHAIN_HOTELS[chain]?.(city) ?? [`${chain} ${city}`];
    candidates.push({ name: names[0], chainName: chain });
    if (names[1]) candidates.push({ name: names[1], chainName: chain });
  }
  candidates.push(...boutiqueNames(city));

  const unique = candidates.filter(
    (item, idx, arr) => arr.findIndex((other) => other.name === item.name) === idx,
  );

  const spread = Math.max(unique.length, 2);
  return unique.slice(0, 4).map((item, index) => {
    const nightlyUsd = nightlyForIndex(iata, index, spread);
    const totalAmountUsd = Math.round(nightlyUsd * nights * 100) / 100;
    const reviewScore = Math.round((7.8 + (spread - index) * 0.35) * 10) / 10;
    const ratingStars = index === 0 ? 4 : index === 1 ? 4 : 3;

    return {
      id: `est-${generateId()}`,
      name: item.name,
      chainName: item.chainName,
      ratingStars,
      reviewScore,
      area: city,
      totalAmountUsd,
      currency: "USD",
      nightlyUsd,
    };
  });
}

export function estimatedStaysNotice(liveError?: string, mockMode?: boolean): string {
  if (mockMode) return "Showing estimated hotel rates (mock mode).";
  if (liveError?.includes("Stays not enabled")) {
    return "Showing estimated hotel rates — enable Duffel Stays on your account for live pricing.";
  }
  if (liveError?.includes("not configured") || liveError?.includes("No geocoding")) {
    return "Showing estimated hotel rates for this destination.";
  }
  return liveError
    ? `Showing estimated hotel rates — ${liveError.charAt(0).toLowerCase()}${liveError.slice(1)}`
    : "Showing estimated hotel rates until live search is available.";
}
