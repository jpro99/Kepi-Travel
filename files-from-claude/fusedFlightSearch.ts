// src/lib/flights/fusedFlightSearch.ts
// The orchestrator. Fuses Duffel cash offers + Seats.aero award offers, layers
// the cash-vs-points comparison and per-user reachability, and returns one
// ranked list plus a single "best play" headline.
//
// This is deliberately source-agnostic about cash: pass in your already-working
// Duffel results via the `fetchCashOffers` callback so this module never
// duplicates your Command Deck Duffel logic.

import type {
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
import {
  resolveReachability,
  getActiveTransferBonuses,
} from "./transferPartners";

type FetchCashOffers = (params: FusedSearchParams) => Promise<CashOffer[]>;

export async function fusedFlightSearch(
  params: FusedSearchParams,
  fetchCashOffers: FetchCashOffers
): Promise<FusedSearchResult> {
  const warnings: string[] = [];

  // Run cash + award + personalization context in parallel. Each is wrapped so
  // one failing source never sinks the whole search.
  const [cashOffers, awardOffers, balances, valuations, bonuses] =
    await Promise.all([
      safe(() => fetchCashOffers(params), [] as CashOffer[], () =>
        warnings.push("Cash search (Duffel) failed — showing award results only.")
      ),
      safe(
        () =>
          searchAwardAvailability({
            origin: params.origin,
            destination: params.destination,
            departDate: params.departDate,
            cabin: params.cabin,
          }),
        [],
        () => warnings.push("Award search (Seats.aero) failed — cash only.")
      ),
      params.userId
        ? safe(() => getLoyaltyBalances(params.userId as string), {})
        : Promise.resolve({}),
      getProgramValuations(),
      getActiveTransferBonuses(),
    ]);

  if (!isSeatsAeroConfigured()) {
    warnings.push(
      "SEATS_AERO_API_KEY not set — award (points) results are disabled."
    );
  }

  // Cheapest cash fare is the yardstick for every points comparison.
  const cheapestCashOffer = [...cashOffers].sort(
    (a, b) => a.totalAmount - b.totalAmount
  )[0];

  const fused: FusedOffer[] = [];

  // Cash offers: cash-equivalent is just the price.
  for (const cash of cashOffers) {
    fused.push({
      offer: cash,
      cashEquivalent: cash.totalAmount,
      isBestValue: false,
    });
  }

  // Award offers: compute cash-equivalent, realized CPP, reachability, reason.
  for (const award of awardOffers) {
    const cpp = valuations[award.program];
    const cashEquivalent = awardCashEquivalent(award, cpp);

    let reachable: boolean | undefined;
    let reachableVia;
    if (params.userId) {
      const paths = resolveReachability(
        award.program,
        award.milesCost,
        balances,
        bonuses
      );
      reachableVia = paths;
      reachable = paths.some((p) => p.hasEnoughBalance);
    }

    let recommendationReason: string | undefined;
    if (cheapestCashOffer) {
      recommendationReason = decideCashVsPoints(
        cheapestCashOffer,
        award,
        cpp
      ).reason;
    }

    fused.push({
      offer: award,
      cashEquivalent,
      centsPerPoint: realizedCpp(award, cheapestCashOffer),
      isBestValue: false,
      reachable,
      reachableVia,
      recommendationReason,
    });
  }

  // Rank everything by true cash-equivalent (cheapest effective cost first).
  // Tie-break: prefer reachable awards, then cash for simplicity.
  fused.sort((a, b) => {
    if (a.cashEquivalent !== b.cashEquivalent) {
      return a.cashEquivalent - b.cashEquivalent;
    }
    const aReach = a.offer.kind === "award" && a.reachable ? 1 : 0;
    const bReach = b.offer.kind === "award" && b.reachable ? 1 : 0;
    if (aReach !== bReach) return bReach - aReach;
    return a.offer.kind === "cash" ? -1 : 1;
  });

  if (fused.length > 0) fused[0].isBestValue = true;

  const cheapestCash = fused.find((f) => f.offer.kind === "cash");
  const bestAward = fused.find(
    (f) => f.offer.kind === "award" && (params.userId ? f.reachable : true)
  );

  return {
    params,
    offers: fused,
    cheapestCash,
    bestAward,
    headline: buildHeadline(fused[0], cheapestCash, bestAward),
    warnings,
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

// Wrap a promise so a thrown/rejected source returns a fallback + optional note.
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
