import type {
  AwardOffer,
  CabinClass,
  CashOffer,
  FusedOffer,
  FusedSearchParams,
  FusedSearchResult,
  LoyaltyProgram,
  OriginAwardRow,
  OriginCashRow,
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
import {
  gatewayPlayHeadline,
  gatewayPlayTitle,
  isGatewayAirport,
  resolveAwardSearchOrigins,
  resolveCashSearchOrigins,
} from "./gatewaySearch";
import { buildAlaskaUpgradeCandidates } from "./alaskaUpgrade";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

const TRIP_SEARCH_CABINS: CabinClass[] = ["economy", "business"];

type FetchCashOffers = (params: FusedSearchParams) => Promise<CashOffer[]>;

const PROGRAM_LABELS: Record<string, string> = {
  alaska: "Alaska",
  united: "United",
  american: "American",
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  avios_ba: "BA Avios",
  singapore_krisflyer: "Singapore",
  lifemiles: "LifeMiles",
};

function programLabel(program: string): string {
  return PROGRAM_LABELS[program] ?? program;
}

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

  const fused = buildFusedOffers({
    cashOffers,
    awardOffers,
    params,
    pax,
    balances,
    valuations,
    bonuses,
    primaryOrigin: params.origin,
    homeOrigins: [params.origin],
  });

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
      cashOriginsSearched: [params.origin],
      awardOriginsSearched: [params.origin],
      awardGatewaysSearched: [],
    },
  };
}

interface BuildFusedInput {
  cashOffers: CashOffer[];
  awardOffers: Array<AwardOffer & { searchOrigin?: string }>;
  params: FusedSearchParams;
  pax: number;
  balances: Awaited<ReturnType<typeof getLoyaltyBalances>>;
  valuations: Awaited<ReturnType<typeof getProgramValuations>>;
  bonuses: Awaited<ReturnType<typeof getActiveTransferBonuses>>;
  primaryOrigin: string;
  homeOrigins: string[];
  feederCashByGateway?: Map<string, number>;
}

function buildFusedOffers(input: BuildFusedInput): FusedOffer[] {
  const {
    cashOffers,
    awardOffers,
    params,
    pax,
    balances,
    valuations,
    bonuses,
    primaryOrigin,
    homeOrigins,
    feederCashByGateway,
  } = input;

  const sameCabinCash = cashOffers.filter((c) => c.cabin === params.cabin);
  const benchmarkCash = [...(sameCabinCash.length ? sameCabinCash : cashOffers)].sort(
    (a, b) => a.totalAmount - b.totalAmount,
  )[0];

  const fused: FusedOffer[] = [];

  for (const cash of cashOffers) {
    const origin = cash.segments[0]?.origin ?? params.origin;
    fused.push({
      offer: cash,
      cashEquivalent: cash.totalAmount,
      isBestValue: false,
      metrics: deriveMetrics(cash),
      searchOrigin: origin.toUpperCase(),
    });
  }

  for (const award of awardOffers) {
    const searchOrigin = (award.searchOrigin ?? award.segments[0]?.origin ?? params.origin).toUpperCase();
    const cpp = valuations[award.program];
    const cashEquivalent = awardCashEquivalent(award, pax, cpp);
    const isGateway = isGatewayAirport(searchOrigin) && !homeOrigins.includes(searchOrigin);
    const feederOrigin = isGateway ? primaryOrigin : undefined;
    const feederCashUsd = isGateway ? feederCashByGateway?.get(searchOrigin) : undefined;

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
      cashEquivalent: cashEquivalent + (feederCashUsd ?? 0) * 100,
      centsPerPoint: realizedCpp(award, benchmarkCash, pax),
      isBestValue: false,
      reachable,
      reachableVia,
      recommendationReason: isGateway
        ? `${gatewayPlayTitle(searchOrigin, feederOrigin)} — ${programLabel(award.program)} ${award.milesCost.toLocaleString()} mi from ${searchOrigin}${feederOrigin ? ` (+ feeder from ${feederOrigin})` : ""}.`
        : recommendationReason,
      metrics: deriveMetrics(award),
      searchOrigin,
      isGatewayPlay: isGateway,
      feederOrigin,
      feederCashUsd,
      gatewayPlayTitle: isGateway ? gatewayPlayTitle(searchOrigin, feederOrigin) : undefined,
    });
  }

  return fused;
}

function buildHeadline(
  best: FusedOffer | undefined,
  cheapestCash: FusedOffer | undefined,
  bestAward: FusedOffer | undefined,
): string | undefined {
  if (!best) return undefined;
  if (best.isGatewayPlay && best.offer.kind === "award") {
    const award = best.offer;
    return gatewayPlayHeadline(
      best.searchOrigin ?? "SEA",
      best.offer.segments[0]?.destination ?? "",
      programLabel(award.program),
      award.milesCost,
      best.feederOrigin,
    );
  }
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
    const origin = cheapestCash.searchOrigin ?? cheapestCash.offer.segments[0]?.origin ?? "";
    const usd = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cheapestCash.cashEquivalent / 100);
    const originBit = origin ? ` from ${origin}` : "";
    if (bestAward) {
      return `Best play: pay cash at ${usd}${originBit}. No award beats it after surcharges.`;
    }
    return `Best cash${originBit}: ${usd}. No award space found at home airports — see West Coast gateway plays below.`;
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

async function searchAwardsAtOrigin(
  origin: string,
  params: Omit<FusedSearchParams, "origin">,
): Promise<{ offers: AwardOffer[]; cached: boolean }> {
  const key = awardCacheKey({ ...params, origin });
  const result = await withCache(key, AWARD_TTL_SECONDS, () =>
    searchAwardAvailability({
      origin,
      destination: params.destination,
      departDate: params.departDate,
      cabin: params.cabin,
    }),
  );
  return { offers: result.value, cached: result.cached };
}

async function searchCashAtOrigin(
  origin: string,
  params: Omit<FusedSearchParams, "origin">,
  fetchCashOffers: FetchCashOffers,
): Promise<{ offers: CashOffer[]; cached: boolean }> {
  const key = cashCacheKey({ ...params, origin });
  const result = await withCache(key, CASH_TTL_SECONDS, () =>
    fetchCashOffers({ ...params, origin }),
  );
  return { offers: result.value, cached: result.cached };
}

function buildOriginCashLeaderboard(
  cashOffers: CashOffer[],
  cabin: CabinClass,
  departDate: string,
): OriginCashRow[] {
  const byOrigin = new Map<string, OriginCashRow>();
  for (const offer of cashOffers) {
    if (offer.cabin !== cabin) continue;
    const origin = (offer.segments[0]?.origin ?? "").toUpperCase();
    if (!origin) continue;
    const existing = byOrigin.get(origin);
    if (existing && existing.totalAmount <= offer.totalAmount) continue;
    byOrigin.set(origin, {
      origin,
      totalAmount: offer.totalAmount,
      currency: offer.currency,
      airline: offer.airlineName ?? offer.segments[0]?.marketingCarrier ?? "Airline",
      stops: Math.max(0, offer.segments.length - 1),
      offerId: offer.id,
      cabin: offer.cabin,
      departureDate: departDate,
    });
  }
  return [...byOrigin.values()].sort((a, b) => a.totalAmount - b.totalAmount);
}

/** Cheapest (by cash-equivalent value, not raw miles) live award per origin — points counterpart to buildOriginCashLeaderboard. */
export function buildOriginAwardLeaderboard(
  awardOffers: Array<AwardOffer & { searchOrigin?: string }>,
  cashOffers: CashOffer[],
  cabin: CabinClass,
  departDate: string,
  homeOrigins: string[],
  valuations: Record<LoyaltyProgram, number>,
  feederCashByGateway: Map<string, number>,
  primaryOrigin: string,
): OriginAwardRow[] {
  const sameCabinCash = cashOffers.filter((c) => c.cabin === cabin);
  const benchmarkCash = [...(sameCabinCash.length ? sameCabinCash : cashOffers)].sort(
    (a, b) => a.totalAmount - b.totalAmount,
  )[0];

  const byOrigin = new Map<string, { row: OriginAwardRow; cashEquivalent: number }>();
  for (const offer of awardOffers) {
    if (offer.cabin !== cabin) continue;
    const origin = (offer.searchOrigin ?? offer.segments[0]?.origin ?? "").toUpperCase();
    if (!origin) continue;
    const cpp = valuations[offer.program];
    const cashEquivalent = awardCashEquivalent(offer, 1, cpp);
    const existing = byOrigin.get(origin);
    if (existing && existing.cashEquivalent <= cashEquivalent) continue;

    const isGateway = isGatewayAirport(origin) && !homeOrigins.includes(origin);
    byOrigin.set(origin, {
      cashEquivalent,
      row: {
        origin,
        milesCost: offer.milesCost,
        program: offer.program,
        centsPerPoint: realizedCpp(offer, benchmarkCash, 1),
        pricingSource: "live",
        stops: Math.max(0, offer.segments.length - 1),
        cabin: offer.cabin,
        departureDate: departDate,
        isGatewayPlay: isGateway,
        feederOrigin: isGateway ? primaryOrigin : undefined,
        feederCashUsd: isGateway ? feederCashByGateway.get(origin) : undefined,
        offerId: offer.rawAvailabilityId ?? offer.id,
      },
    });
  }
  return [...byOrigin.values()]
    .sort((a, b) => a.cashEquivalent - b.cashEquivalent)
    .map((entry) => entry.row);
}

type CabinSearchBundle = {
  cabin: CabinClass;
  offers: FusedOffer[];
  cheapestCash?: FusedOffer;
  bestAward?: FusedOffer;
  originCashLeaderboard: OriginCashRow[];
  originAwardLeaderboard: OriginAwardRow[];
  gatewayPlays?: FusedOffer[];
  headline?: string;
  warnings: string[];
  cashOffers: CashOffer[];
  meta: FusedSearchResult["meta"];
};

async function runCabinFusedSearch(
  cabin: CabinClass,
  intent: TripIntent,
  cashOrigins: string[],
  primaryOrigin: string,
  destination: string,
  userId: string,
  fetchCashOffers: FetchCashOffers,
): Promise<CabinSearchBundle> {
  const baseParams: Omit<FusedSearchParams, "origin"> = {
    destination,
    departDate: intent.startDate,
    returnDate: intent.endDate,
    passengers: 1,
    cabin,
    userId,
  };

  const awardOrigins = resolveAwardSearchOrigins(cashOrigins);
  const startedAt = Date.now();
  const warnings: string[] = [];

  const [cashResults, awardResults, balances, valuations, bonuses] = await Promise.all([
    Promise.all(cashOrigins.map((origin) => searchCashAtOrigin(origin, baseParams, fetchCashOffers))),
    Promise.all(awardOrigins.all.map((origin) => searchAwardsAtOrigin(origin, baseParams))),
    safe(() => getLoyaltyBalances(userId), {}),
    getProgramValuations(),
    getActiveTransferBonuses(),
  ]);

  const cashOffers = cashResults.flatMap((r) => r.offers);
  const awardOffersRaw = awardResults.flatMap((r, i) =>
    r.offers.map((o) => ({ ...o, searchOrigin: awardOrigins.all[i] })),
  );

  const localAwardCount = awardResults
    .slice(0, awardOrigins.locals.length)
    .reduce((sum, r) => sum + r.offers.length, 0);

  if (localAwardCount === 0 && awardOrigins.gateways.length > 0) {
    const gatewayHits = awardOrigins.gateways.filter(
      (_, i) => awardResults[awardOrigins.locals.length + i]?.offers.length > 0,
    );
    if (gatewayHits.length > 0) {
      warnings.push(
        `[${cabin}] No award space from ${awardOrigins.locals.join("/")} — gateway hits: ${gatewayHits.join(", ")}.`,
      );
    }
  }

  const gatewaysWithAwards = [
    ...new Set(
      awardOffersRaw
        .filter((a) => isGatewayAirport(a.searchOrigin ?? "") && !cashOrigins.includes(a.searchOrigin ?? ""))
        .map((a) => a.searchOrigin as string),
    ),
  ];

  const feederCashByGateway = new Map<string, number>();
  if (gatewaysWithAwards.length > 0 && primaryOrigin) {
    const { searchDuffelCashQuotes } = await import("@/lib/providers/duffel/flightOffers");
    const feederResults = await Promise.all(
      gatewaysWithAwards.map(async (gateway) => {
        const result = await searchDuffelCashQuotes({
          origins: [primaryOrigin],
          destination: gateway,
          departureDate: intent.startDate,
          cabinClass: "economy",
        });
        return { gateway, quote: result.quotes[0]?.totalAmountUsd };
      }),
    );
    for (const { gateway, quote } of feederResults) {
      if (quote !== undefined) feederCashByGateway.set(gateway, quote);
    }
  }

  const fused = buildFusedOffers({
    cashOffers,
    awardOffers: awardOffersRaw,
    params: { ...baseParams, origin: primaryOrigin },
    pax: 1,
    balances,
    valuations,
    bonuses,
    primaryOrigin,
    homeOrigins: cashOrigins,
    feederCashByGateway,
  });

  const ranked = scoreAndRank(fused, { ...baseParams, origin: primaryOrigin });
  const cheapestCash = ranked.find((f) => f.offer.kind === "cash");
  const bestAward = ranked.find(
    (f) => f.offer.kind === "award" && (userId ? f.reachable !== false : true),
  );
  const gatewayPlays = ranked.filter((f) => f.isGatewayPlay && f.offer.kind === "award");

  return {
    cabin,
    offers: ranked,
    cheapestCash,
    bestAward,
    originCashLeaderboard: buildOriginCashLeaderboard(cashOffers, cabin, intent.startDate),
    originAwardLeaderboard: buildOriginAwardLeaderboard(
      awardOffersRaw,
      cashOffers,
      cabin,
      intent.startDate,
      cashOrigins,
      valuations,
      feederCashByGateway,
      primaryOrigin,
    ),
    gatewayPlays: gatewayPlays.length > 0 ? gatewayPlays : undefined,
    headline: buildHeadline(ranked[0], cheapestCash, bestAward),
    warnings,
    cashOffers,
    meta: {
      cashCount: cashOffers.length,
      awardCount: awardOffersRaw.length,
      cashCached: cashResults.some((r) => r.cached),
      awardCached: awardResults.some((r) => r.cached),
      elapsedMs: Date.now() - startedAt,
      cashOriginsSearched: cashOrigins,
      awardOriginsSearched: awardOrigins.all,
      awardGatewaysSearched: awardOrigins.gateways,
    },
  };
}

/** Trip Planner analyze — multi-origin cash + gateway award search (economy + business). */
export async function runFusedSearchForTrip(
  intent: TripIntent,
  searchAirports: string[],
  genome: TravelerGenome,
  userId: string,
): Promise<FusedSearchResult | null> {
  const destination = (intent.stops?.[0]?.iata ?? intent.destinationIata)?.toUpperCase();
  if (!destination) return null;

  const cashOrigins = resolveCashSearchOrigins(searchAirports);
  const primaryOrigin = cashOrigins[0];
  if (!primaryOrigin) return null;

  const { fetchDuffelCashOffers } = await import("@/lib/flights/duffelAdapter");
  // Hard cap — this fans out to multiple origins x cabins against Seats.aero (which has hit
  // 18s+ hangs on its own) and Duffel; better to return null and let the route degrade than
  // hang the whole /analyze request.
  return Promise.race([
    runFusedSearchForTripInner(intent, genome, userId, cashOrigins, primaryOrigin, destination, fetchDuffelCashOffers),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 9_000)),
  ]);
}

async function runFusedSearchForTripInner(
  intent: TripIntent,
  genome: TravelerGenome,
  userId: string,
  cashOrigins: string[],
  primaryOrigin: string,
  destination: string,
  fetchDuffelCashOffers: FetchCashOffers,
): Promise<FusedSearchResult | null> {
  const preferredCabin = cabinFromGenome(genome);
  const startedAt = Date.now();
  const warnings: string[] = [];

  if (!isSeatsAeroConfigured()) {
    warnings.push("SEATS_AERO_API_KEY not set — award results disabled.");
  }

  const cabinBundles = await Promise.all(
    TRIP_SEARCH_CABINS.map((cabin) =>
      runCabinFusedSearch(cabin, intent, cashOrigins, primaryOrigin, destination, userId, fetchDuffelCashOffers),
    ),
  );

  const byCabin: Partial<Record<CabinClass, import("./types").CabinSearchSlice>> = {};
  for (const bundle of cabinBundles) {
    byCabin[bundle.cabin] = {
      cabin: bundle.cabin,
      offers: bundle.offers,
      cheapestCash: bundle.cheapestCash,
      bestAward: bundle.bestAward,
      originCashLeaderboard: bundle.originCashLeaderboard,
      originAwardLeaderboard: bundle.originAwardLeaderboard,
      gatewayPlays: bundle.gatewayPlays,
      headline: bundle.headline,
    };
    warnings.push(...bundle.warnings);
  }

  const primaryBundle =
    cabinBundles.find((b) => b.cabin === preferredCabin) ?? cabinBundles[1] ?? cabinBundles[0];
  if (!primaryBundle) return null;

  const economyBundle = cabinBundles.find((b) => b.cabin === "economy");
  const guestUpgrade = genome.instruments.find((i) => i.type === "guest_upgrade");
  const instrumentLabel = guestUpgrade?.label ?? "Alaska Guest Upgrade Certificate";
  const alaskaUpgradeCandidates =
    economyBundle && (guestUpgrade || intent.wantsAlaskaUpgrade)
      ? buildAlaskaUpgradeCandidates(economyBundle.cashOffers, instrumentLabel, intent.startDate)
      : undefined;

  if (intent.wantsAlaskaUpgrade && alaskaUpgradeCandidates?.length === 0) {
    warnings.push(
      "You asked to use an Alaska upgrade certificate — no Alaska-metal economy fares found on this date. Try Compare dates or the Mix tab.",
    );
  }

  const totalElapsed = Date.now() - startedAt;
  const mergedMeta = {
    cashCount: cabinBundles.reduce((sum, b) => sum + b.meta.cashCount, 0),
    awardCount: cabinBundles.reduce((sum, b) => sum + b.meta.awardCount, 0),
    cashCached: cabinBundles.some((b) => b.meta.cashCached),
    awardCached: cabinBundles.some((b) => b.meta.awardCached),
    elapsedMs: totalElapsed,
    cashOriginsSearched: cashOrigins,
    awardOriginsSearched: primaryBundle.meta.awardOriginsSearched,
    awardGatewaysSearched: primaryBundle.meta.awardGatewaysSearched,
  };

  return {
    params: {
      destination,
      departDate: intent.startDate,
      returnDate: intent.endDate,
      passengers: 1,
      cabin: preferredCabin,
      userId,
      origin: primaryOrigin,
    },
    offers: primaryBundle.offers,
    cheapestCash: primaryBundle.cheapestCash,
    bestAward: primaryBundle.bestAward,
    originCashLeaderboard: primaryBundle.originCashLeaderboard,
    originAwardLeaderboard: primaryBundle.originAwardLeaderboard,
    gatewayPlays: primaryBundle.gatewayPlays,
    cabinsSearched: TRIP_SEARCH_CABINS,
    byCabin,
    alaskaUpgradeCandidates:
      alaskaUpgradeCandidates && alaskaUpgradeCandidates.length > 0
        ? alaskaUpgradeCandidates
        : undefined,
    headline: primaryBundle.headline,
    warnings,
    meta: mergedMeta,
  };
}
