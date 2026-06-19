import type {
  AwardOffer,
  CabinClass,
  CashOffer,
  FusedOffer,
  FusedSearchParams,
  FusedSearchResult,
} from "./types";
import { searchAwardAvailability, isSeatsAeroConfigured } from "./seatsAero";
import {
  awardCashEquivalent,
  decideCashVsPoints,
  getProgramValuations,
  realizedCpp,
} from "./cppValuations";
import { getLoyaltyBalances } from "./loyaltyBalances";
import { getActiveTransferBonuses, resolveReachability } from "./transferPartners";
import {
  withCache,
  cashCacheKey,
  awardCacheKey,
  CASH_TTL_SECONDS,
  AWARD_TTL_SECONDS,
} from "./flightCache";
import { scoreAndRank, deriveMetrics } from "./scoring";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

type FetchCashOffers = (params: FusedSearchParams) => Promise<CashOffer[]>;

export async function fusedFlightSearch(
  params: FusedSearchParams,
  fetchCashOffers: FetchCashOffers,
): Promise<FusedSearchResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const pax = Math.max(1, params.passengers || 1);

  const [cashResult, awardResult, balances, valuations, bonuses] = await Promise.all([
    safe(
      () =>
        withCache(cashCacheKey(params), CASH_TTL_SECONDS, () => fetchCashOffers(params)),
      { value: [] as CashOffer[], cached: false },
      () => warnings.push("Cash search (Duffel) failed — award results only."),
    ),
    safe(
      () =>
        withCache(awardCacheKey(params), AWARD_TTL_SECONDS, () =>
          searchAwardAvailability({
            origin: params.origin,
            destination: params.destination,
            departDate: params.departDate,
            cabin: params.cabin,
          }),
        ),
      { value: [] as AwardOffer[], cached: false },
      () => warnings.push("Award search (Seats.aero) failed — cash only."),
    ),
    params.userId
      ? safe(() => getLoyaltyBalances(params.userId as string), {})
      : Promise.resolve({}),
    getProgramValuations(),
    getActiveTransferBonuses(),
  ]);

  const cashOffers = cashResult.value;
  const awardOffers = awardResult.value;

  if (!isSeatsAeroConfigured()) {
    warnings.push("SEATS_AERO_API_KEY not set — award results disabled.");
  }

  const sameCabinCash = cashOffers.filter((c) => c.cabin === params.cabin);
  const benchmarkCash = [...(sameCabinCash.length ? sameCabinCash : cashOffers)].sort(
    (a, b) => a.totalAmount - b.totalAmount,
  )[0];

  const fused: FusedOffer[] = [];

  for (const cash of cashOffers) {
    fused.push({
      offer: cash,
      cashEquivalent: cash.totalAmount,
      isBestValue: false,
      metrics: deriveMetrics(cash),
    });
  }

  for (const award of awardOffers) {
    const cpp = valuations[award.program];
    const cashEquivalent = awardCashEquivalent(award, pax, cpp);

    let reachable: boolean | undefined;
    let reachableVia;
    if (params.userId) {
      reachableVia = resolveReachability(award.program, award.milesCost * pax, balances, bonuses);
      reachable = reachableVia.some((p) => p.hasEnoughBalance);
    }

    const recommendationReason = benchmarkCash
      ? decideCashVsPoints(benchmarkCash, award, pax, cpp).reason
      : undefined;

    fused.push({
      offer: award,
      cashEquivalent,
      centsPerPoint: realizedCpp(award, benchmarkCash, pax),
      isBestValue: false,
      reachable,
      reachableVia,
      recommendationReason,
      metrics: deriveMetrics(award),
    });
  }

  const ranked = scoreAndRank(fused, params);
  const cheapestCash = ranked.find((f) => f.offer.kind === "cash");
  const bestAward = ranked.find(
    (f) => f.offer.kind === "award" && (params.userId ? f.reachable : true),
  );

  return {
    params,
    offers: ranked,
    cheapestCash,
    bestAward,
    headline: buildHeadline(ranked[0], cheapestCash, bestAward),
    warnings,
    meta: {
      cashCount: cashOffers.length,
      awardCount: awardOffers.length,
      cashCached: cashResult.cached,
      awardCached: awardResult.cached,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

function buildHeadline(
  best: FusedOffer | undefined,
  cheapestCash: FusedOffer | undefined,
  bestAward: FusedOffer | undefined,
): string | undefined {
  if (!best) return undefined;
  if (best.offer.kind === "award" && best.recommendationReason) {
    return best.recommendationReason;
  }
  if (
    cheapestCash &&
    bestAward &&
    bestAward.recommendationReason &&
    bestAward.cashEquivalent < cheapestCash.cashEquivalent
  ) {
    return bestAward.recommendationReason;
  }
  if (cheapestCash) {
    const usd = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cheapestCash.cashEquivalent / 100);
    return `Best play: pay cash at ${usd}. No award beats it after surcharges.`;
  }
  return undefined;
}

async function safe<T>(fn: () => Promise<T>, fallback: T, onError?: () => void): Promise<T> {
  try {
    return await fn();
  } catch {
    onError?.();
    return fallback;
  }
}

export function cabinFromGenome(genome: TravelerGenome): CabinClass {
  if (genome.cabinPreference === "first") return "first";
  if (genome.cabinPreference === "premium_economy") return "premium_economy";
  if (genome.cabinPreference === "economy") return "economy";
  return "business";
}

/** Trip Planner analyze — fuses live cash + awards for main outbound leg. */
export async function runFusedSearchForTrip(
  intent: TripIntent,
  searchAirports: string[],
  genome: TravelerGenome,
  userId: string,
): Promise<FusedSearchResult | null> {
  const destination = (intent.stops?.[0]?.iata ?? intent.destinationIata)?.toUpperCase();
  const origin = searchAirports[0]?.toUpperCase();
  if (!destination || !origin) return null;

  const { fetchDuffelCashOffers } = await import("@/lib/flights/duffelAdapter");
  return fusedFlightSearch(
    {
      origin,
      destination,
      departDate: intent.startDate,
      returnDate: intent.endDate,
      passengers: 1,
      cabin: cabinFromGenome(genome),
      userId,
    },
    fetchDuffelCashOffers,
  );
}
