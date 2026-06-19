import { buildSeatsAeroSearchUrl, estimateAwardMiles } from "@/lib/decision/awardFlexEstimate";
import { resolveCppForProgram, labelFor } from "@/lib/flights/cppValuations";
import { searchAwardAvailability, isSeatsAeroConfigured } from "@/lib/flights/seatsAero";
import type { AwardOffer, CabinClass } from "@/lib/flights/types";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import type { TravelerGenome } from "@/lib/traveler/types";
import type { PricedTopologyLeg, TopologyFlightLeg, TripTopologyCandidate } from "@/lib/decision/topology/types";

const AWARD_CPP = 2.0;
const BASE_AWARD_MILES = 70_000;
const DEFAULT_SEATS_AERO_BUDGET = 15;

export class DuffelCallBudget {
  remaining: number;
  used = 0;

  constructor(limit: number) {
    this.remaining = limit;
  }

  tryConsume(count = 1): boolean {
    if (this.remaining < count) return false;
    this.remaining -= count;
    this.used += count;
    return true;
  }
}

export class SeatsAeroCallBudget {
  remaining: number;
  used = 0;

  constructor(limit: number) {
    this.remaining = limit;
  }

  tryConsume(count = 1): boolean {
    if (this.remaining < count) return false;
    this.remaining -= count;
    this.used += count;
    return true;
  }
}

export interface TopologyPricingContext {
  seatsAeroBudget: SeatsAeroCallBudget;
  awardCabin: CabinClass;
  awardCache: Map<string, AwardOffer | null>;
}

export function imputedAwardUsd(miles: number, cpp = AWARD_CPP): number {
  return Math.round((miles * cpp) / 100);
}

function awardCacheKey(leg: TopologyFlightLeg, cabin: CabinClass): string {
  return `${leg.fromIata}-${leg.toIata}-${leg.departureDate}-${cabin}`;
}

function cabinFromGenome(genome: TravelerGenome): CabinClass {
  if (genome.cabinPreference === "first") return "first";
  if (genome.cabinPreference === "premium_economy") return "premium_economy";
  if (genome.cabinPreference === "economy") return "economy";
  return "business";
}

export async function buildTopologyPricingContext(
  genome: TravelerGenome,
  maxSeatsAeroCalls = DEFAULT_SEATS_AERO_BUDGET,
): Promise<TopologyPricingContext> {
  return {
    seatsAeroBudget: new SeatsAeroCallBudget(maxSeatsAeroCalls),
    awardCabin: cabinFromGenome(genome),
    awardCache: new Map(),
  };
}

function pickBestAwardOffer(offers: AwardOffer[], leg: TopologyFlightLeg): AwardOffer | null {
  const origin = leg.fromIata.toUpperCase();
  const destination = leg.toIata.toUpperCase();
  const matching = offers.filter((offer) => {
    const seg = offer.segments[0];
    return seg?.origin.toUpperCase() === origin && seg?.destination.toUpperCase() === destination;
  });
  const pool = matching.length > 0 ? matching : offers;
  return pool.sort((a, b) => a.milesCost - b.milesCost)[0] ?? null;
}

async function priceEstimatedAwardLeg(leg: TopologyFlightLeg): Promise<PricedTopologyLeg> {
  const miles = estimateAwardMiles({
    baseMiles: BASE_AWARD_MILES,
    origin: leg.fromIata,
    destination: leg.toIata,
    departureDate: leg.departureDate,
    cabin: "business",
  });
  return {
    leg,
    priced: true,
    amountUsd: 5.6,
    awardMiles: miles,
    awardLive: false,
    awardCpp: AWARD_CPP,
    awardImputedUsd: imputedAwardUsd(miles),
    verifyUrl: buildSeatsAeroSearchUrl({
      origin: leg.fromIata,
      destination: leg.toIata,
      departureDate: leg.departureDate,
    }),
  };
}

async function priceLiveAwardLeg(
  leg: TopologyFlightLeg,
  ctx: TopologyPricingContext,
): Promise<PricedTopologyLeg> {
  const cacheKey = awardCacheKey(leg, ctx.awardCabin);
  if (ctx.awardCache.has(cacheKey)) {
    const cached = ctx.awardCache.get(cacheKey);
    if (cached) {
      const cpp = await resolveCppForProgram(cached.program);
      return {
        leg,
        priced: true,
        amountUsd: cached.cashSurcharge / 100,
        awardMiles: cached.milesCost,
        awardProgram: labelFor(cached.program),
        awardAirlines: cached.segments[0]?.marketingCarrier ?? cached.program,
        awardLive: true,
        awardCpp: cpp,
        awardImputedUsd: imputedAwardUsd(cached.milesCost, cpp),
        verifyUrl: buildSeatsAeroSearchUrl({
          origin: leg.fromIata,
          destination: leg.toIata,
          departureDate: leg.departureDate,
        }),
      };
    }
    return priceEstimatedAwardLeg(leg);
  }

  if (!isSeatsAeroConfigured() || !ctx.seatsAeroBudget.tryConsume()) {
    ctx.awardCache.set(cacheKey, null);
    return priceEstimatedAwardLeg(leg);
  }

  const offers = await searchAwardAvailability({
    origin: leg.fromIata,
    destination: leg.toIata,
    departDate: leg.departureDate,
    cabin: ctx.awardCabin,
  });

  const best = pickBestAwardOffer(offers, leg);
  ctx.awardCache.set(cacheKey, best);

  if (!best) {
    return priceEstimatedAwardLeg(leg);
  }

  const cpp = await resolveCppForProgram(best.program);
  return {
    leg,
    priced: true,
    amountUsd: best.cashSurcharge / 100,
    awardMiles: best.milesCost,
    awardProgram: labelFor(best.program),
    awardAirlines: best.segments[0]?.marketingCarrier ?? best.program,
    awardLive: true,
    awardCpp: cpp,
    awardImputedUsd: imputedAwardUsd(best.milesCost, cpp),
    verifyUrl: buildSeatsAeroSearchUrl({
      origin: leg.fromIata,
      destination: leg.toIata,
      departureDate: leg.departureDate,
    }),
  };
}

export async function priceTopologyLeg(
  leg: TopologyFlightLeg,
  budget?: DuffelCallBudget,
  pricingContext?: TopologyPricingContext,
): Promise<PricedTopologyLeg> {
  if (leg.pricing === "award_estimate") {
    if (pricingContext) {
      return priceLiveAwardLeg(leg, pricingContext);
    }
    return priceEstimatedAwardLeg(leg);
  }

  if (budget && !budget.tryConsume()) {
    return { leg, priced: false };
  }

  const result = await searchDuffelCashQuotes({
    origins: [leg.fromIata],
    destination: leg.toIata,
    departureDate: leg.departureDate,
  });
  const best = result.quotes[0];
  if (!best) {
    return { leg, priced: false };
  }
  return {
    leg,
    priced: true,
    amountUsd: best.totalAmountUsd,
    currency: best.currency,
    airline: best.airline,
    stops: best.stops,
    offerId: best.offerId,
    flightNumber: best.flightNumber,
  };
}

/** Price every flight leg in parallel — maximizes Duffel throughput per topology. */
export async function priceTopologyCandidateParallel(
  candidate: TripTopologyCandidate,
  budget: DuffelCallBudget,
  pricingContext?: TopologyPricingContext,
): Promise<PricedTopologyLeg[]> {
  return Promise.all(
    candidate.flightLegs.map((leg) => priceTopologyLeg(leg, budget, pricingContext)),
  );
}

export function summarizePricedTopology(
  candidate: TripTopologyCandidate,
  legs: PricedTopologyLeg[],
  hotelCashUsd: number,
): {
  totalCashUsd: number;
  hotelCashUsd: number;
  grandTotalCashUsd: number;
  totalAwardMiles: number;
  imputedPointsUsd: number;
  totalTripValue: number;
  confidence: "live" | "mixed" | "estimated";
  liveLegCount: number;
  liveAwardLegCount: number;
} {
  let totalCashUsd = candidate.groundLegs.reduce((sum, g) => sum + g.costUsd, 0);
  let totalAwardMiles = 0;
  let imputedPointsUsd = 0;
  let liveLegCount = 0;
  let liveAwardLegCount = 0;
  let hasAward = false;
  let hasEstimatedAward = false;
  let hasUnpriced = false;

  for (const row of legs) {
    if (row.priced && row.amountUsd !== undefined) {
      totalCashUsd += row.amountUsd;
      if (row.leg.pricing === "cash_live") liveLegCount += 1;
      if (row.leg.pricing === "award_estimate") {
        hasAward = true;
        if (row.awardLive) {
          liveAwardLegCount += 1;
          liveLegCount += 1;
        } else {
          hasEstimatedAward = true;
        }
      }
    } else if (row.leg.pricing === "cash_live") {
      hasUnpriced = true;
    }
    if (row.awardMiles) {
      totalAwardMiles += row.awardMiles;
      imputedPointsUsd += row.awardImputedUsd ?? imputedAwardUsd(row.awardMiles, row.awardCpp);
    }
  }

  const flightCash = Math.round(totalCashUsd);
  const grandTotalCashUsd = flightCash + hotelCashUsd;
  const totalTripValue = grandTotalCashUsd + imputedPointsUsd;

  let confidence: "live" | "mixed" | "estimated" = "live";
  if (hasUnpriced) confidence = hasAward || liveLegCount > 0 ? "mixed" : "estimated";
  else if (hasEstimatedAward) confidence = "mixed";
  else if (hasAward && liveAwardLegCount === 0) confidence = "mixed";

  return {
    totalCashUsd: flightCash,
    hotelCashUsd,
    grandTotalCashUsd,
    totalAwardMiles,
    imputedPointsUsd,
    totalTripValue,
    confidence,
    liveLegCount,
    liveAwardLegCount,
  };
}

export function rankScoreForCheapest(row: {
  candidate: TripTopologyCandidate;
  grandTotalCashUsd: number;
  totalTripValue: number;
  liveLegCount: number;
}): number {
  if (row.candidate.kind === "position_award") {
    return row.totalTripValue;
  }
  return row.grandTotalCashUsd;
}

export { AWARD_CPP, isSeatsAeroConfigured };
