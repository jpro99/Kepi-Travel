import { buildSeatsAeroSearchUrl, estimateAwardMiles } from "@/lib/decision/awardFlexEstimate";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import type { PricedTopologyLeg, TopologyFlightLeg, TripTopologyCandidate } from "@/lib/decision/topology/types";

const AWARD_CPP = 2.0;
const BASE_AWARD_MILES = 70_000;

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

export function imputedAwardUsd(miles: number, cpp = AWARD_CPP): number {
  return Math.round((miles * cpp) / 100);
}

export async function priceTopologyLeg(
  leg: TopologyFlightLeg,
  budget?: DuffelCallBudget,
): Promise<PricedTopologyLeg> {
  if (leg.pricing === "award_estimate") {
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
      verifyUrl: buildSeatsAeroSearchUrl({
        origin: leg.fromIata,
        destination: leg.toIata,
        departureDate: leg.departureDate,
      }),
    };
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
): Promise<PricedTopologyLeg[]> {
  return Promise.all(candidate.flightLegs.map((leg) => priceTopologyLeg(leg, budget)));
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
} {
  let totalCashUsd = candidate.groundLegs.reduce((sum, g) => sum + g.costUsd, 0);
  let totalAwardMiles = 0;
  let liveLegCount = 0;
  let hasAward = false;
  let hasUnpriced = false;

  for (const row of legs) {
    if (row.priced && row.amountUsd !== undefined) {
      totalCashUsd += row.amountUsd;
      if (row.leg.pricing === "cash_live") liveLegCount += 1;
      if (row.leg.pricing === "award_estimate") hasAward = true;
    } else if (row.leg.pricing === "cash_live") {
      hasUnpriced = true;
    }
    if (row.awardMiles) totalAwardMiles += row.awardMiles;
  }

  const imputedPointsUsd = imputedAwardUsd(totalAwardMiles);
  const flightCash = Math.round(totalCashUsd);
  const grandTotalCashUsd = flightCash + hotelCashUsd;
  const totalTripValue = grandTotalCashUsd + imputedPointsUsd;

  let confidence: "live" | "mixed" | "estimated" = "live";
  if (hasUnpriced) confidence = hasAward || liveLegCount > 0 ? "mixed" : "estimated";
  else if (hasAward) confidence = "mixed";

  return {
    totalCashUsd: flightCash,
    hotelCashUsd,
    grandTotalCashUsd,
    totalAwardMiles,
    imputedPointsUsd,
    totalTripValue,
    confidence,
    liveLegCount,
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

export { AWARD_CPP };
