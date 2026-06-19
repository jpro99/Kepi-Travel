import { buildSeatsAeroSearchUrl, estimateAwardMiles } from "@/lib/decision/awardFlexEstimate";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import type { PricedTopologyLeg, TopologyFlightLeg, TripTopologyCandidate } from "@/lib/decision/topology/types";

const AWARD_CPP = 2.0;
const BASE_AWARD_MILES = 70_000;

export function imputedAwardUsd(miles: number, cpp = AWARD_CPP): number {
  return Math.round((miles * cpp) / 100);
}

export async function priceTopologyLeg(leg: TopologyFlightLeg): Promise<PricedTopologyLeg> {
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

export function summarizePricedTopology(
  candidate: TripTopologyCandidate,
  legs: PricedTopologyLeg[],
): {
  totalCashUsd: number;
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
  const totalTripValue = totalCashUsd + imputedPointsUsd;

  let confidence: "live" | "mixed" | "estimated" = "live";
  if (hasUnpriced) confidence = hasAward || liveLegCount > 0 ? "mixed" : "estimated";
  else if (hasAward) confidence = "mixed";

  return {
    totalCashUsd: Math.round(totalCashUsd),
    totalAwardMiles,
    imputedPointsUsd,
    totalTripValue,
    confidence,
    liveLegCount,
  };
}

export { AWARD_CPP };
