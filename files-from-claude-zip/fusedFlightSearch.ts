// src/lib/flights/fusedFlightSearch.ts
// v2 orchestrator. Changes vs v1:
//  - Read-through caching on both sources (cost + latency + loop mitigation)
//  - Passenger-aware comparison (award per-pax scaled to whole-party cash totals)
//  - Cabin-matched benchmark (award compared only to same-cabin cash)
//  - Composite scoring instead of naive cash-equivalent sort
//  - meta block (counts, cache hits, elapsed) for end-to-end log proof

import type {
  CashOffer,
  FusedOffer,
  FusedSearchParams,
  FusedSearchResult,
  AwardOffer,
} from "./types";
import { searchAwardAvailability, isSeatsAeroConfigured } from "./seatsAero";
import {
  awardCashEquivalent,
  decideCashVsPoints,
  getProgramValuations,
  realizedCpp,
} from "./cppValuations";
import { getLoyaltyBalances } from "./loyaltyBalances";
import {
  resolveReachability,
  getActiveTransferBonuses,
} from "./transferPartners";
import {
  withCache,
  cashCacheKey,
  awardCacheKey,
  CASH_TTL_SECONDS,
  AWARD_TTL_SECONDS,
} from "./flightCache";
import { scoreAndRank, deriveMetrics } from "./scoring";

type FetchCashOffers = (params: FusedSearchParams) => Promise<CashOffer[]>;

export async function fusedFlightSearch(
  params: FusedSearchParams,
  fetchCashOffers: FetchCashOffers
): Promise<FusedSearchResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const pax = Math.max(1, params.passengers || 1);

  const [cashResult, awardResult, balances, valuations, bonuses] =
    await Promise.all([
      safe(
        () =>
          withCache(cashCacheKey(params), CASH_TTL_SECONDS, () =>
            fetchCashOffers(params)
          ),
        { value: [] as CashOffer[], cached: false },
        () => warnings.push("Cash search (Duffel) failed — award results only.")
      ),
      safe(
        () =>
          withCache(awardCacheKey(params), AWARD_TTL_SECONDS, () =>
            searchAwardAvailability({
              origin: params.origin,
              destination: params.destination,
              departDate: params.departDate,
              cabin: params.cabin,
            })
          ),
        { value: [] as AwardOffer[], cached: false },
        () => warnings.push("Award search (Seats.aero) failed — cash only.")
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

  // CABIN-MATCHED benchmark: cheapest cash fare in the SAME cabin as the search.
  // (All offers are already this cabin, but we filter defensively.)
  const sameCabinCash = cashOffers.filter((c) => c.cabin === params.cabin);
  const benchmarkCash = [...(sameCabinCash.length ? sameCabinCash : cashOffers)].sort(
    (a, b) => a.totalAmount - b.totalAmount
  )[0];

  const fused: FusedOffer[] = [];

  for (const cash of cashOffers) {
    fused.push({
      offer: cash,
      cashEquivalent: cash.totalAmount, // already all-passenger
      isBestValue: false,
      metrics: deriveMetrics(cash),
    });
  }

  for (const award of awardOffers) {
    const cpp = valuations[award.program];
    // PASSENGER-AWARE: scale per-pax award to whole-party cost.
    const cashEquivalent = awardCashEquivalent(award, pax, cpp);

    let reachable: boolean | undefined;
    let reachableVia;
    if (params.userId) {
      // Reachability is on TOTAL miles needed for the party.
      reachableVia = resolveReachability(
        award.program,
        award.milesCost * pax,
        balances,
        bonuses
      );
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

  // Composite scoring + ranking (sets isBestValue on the top result).
  const ranked = scoreAndRank(fused, params);

  const cheapestCash = ranked.find((f) => f.offer.kind === "cash");
  const bestAward = ranked.find(
    (f) => f.offer.kind === "award" && (params.userId ? f.reachable : true)
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
  bestAward: FusedOffer | undefined
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

async function safe<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: () => void
): Promise<T> {
  try {
    return await fn();
  } catch {
    onError?.();
    return fallback;
  }
}
