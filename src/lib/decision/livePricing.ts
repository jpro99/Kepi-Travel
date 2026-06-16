import type { DecisionBrief, TravelStrategy } from "@/lib/decision/types";
import type { DuffelSearchResult } from "@/lib/providers/duffel/types";
import { rankStrategiesByValue } from "@/lib/decision/strategyRanking";
import type { TravelerGenome } from "@/lib/traveler/types";

function applyQuoteToDirectStrategy(
  strategy: TravelStrategy,
  quote: DuffelSearchResult["quotes"][number],
): TravelStrategy {
  const flightSeg = strategy.segments.find((s) => s.mode === "flight");
  const hotelCost = strategy.segments
    .filter((s) => s.mode !== "flight")
    .reduce((sum, s) => sum + s.costUsd, 0);

  const stopLabel = quote.stops === 0 ? "nonstop" : `${quote.stops} stop${quote.stops > 1 ? "s" : ""}`;
  const updatedFlight = flightSeg
    ? {
        ...flightSeg,
        label: `${quote.origin} → ${quote.destination}`,
        detail: `${quote.airline} · ${stopLabel} · live Duffel ${quote.cabinClass}`,
        costUsd: quote.totalAmountUsd,
      }
    : {
        mode: "flight" as const,
        label: `${quote.origin} → ${quote.destination}`,
        detail: `${quote.airline} · ${stopLabel} · live Duffel`,
        costUsd: quote.totalAmountUsd,
      };

  const otherSegments = strategy.segments.filter((s) => s.mode !== "flight");
  const trueOutOfPocket = Math.round(quote.totalAmountUsd + hotelCost);

  return {
    ...strategy,
    headline: `${quote.origin} → ${quote.destination} · ${stopLabel} · $${quote.totalAmountUsd.toLocaleString()} cash`,
    reasoning: `Live cash fare from Duffel (${quote.airline}, ${quote.departureDate}). Compared against miles and reposition strategies in your genome.`,
    segments: [updatedFlight, ...otherSegments],
    departureAirports: [quote.origin],
    scores: {
      ...strategy.scores,
      trueOutOfPocket,
      valueScore: Math.min(100, Math.round(120 - quote.totalAmountUsd / 40)),
    },
  };
}

export function enrichBriefWithDuffelPricing(
  brief: DecisionBrief,
  duffel: DuffelSearchResult,
  genome: TravelerGenome,
  comfortWeight: number,
): DecisionBrief {
  if (!duffel.configured || duffel.quotes.length === 0) {
    return {
      ...brief,
      livePricing: {
        source: "duffel",
        configured: duffel.configured,
        quotesFound: 0,
        message: duffel.error ?? (duffel.configured ? "No offers" : "Add DUFFEL_ACCESS_TOKEN to .env.local"),
      },
    };
  }

  const best = duffel.quotes[0];
  if (!best) return brief;

  let strategies = brief.strategies.map((s) =>
    s.kind === "direct_cash" ? applyQuoteToDirectStrategy(s, best) : s,
  );

  strategies = rankStrategiesByValue(strategies, genome, comfortWeight);

  return {
    ...brief,
    strategies,
    livePricing: {
      source: "duffel",
      configured: true,
      quotesFound: duffel.quotes.length,
      bestOffer: {
        origin: best.origin,
        destination: best.destination,
        amount: best.totalAmountUsd,
        currency: best.currency,
        airline: best.airline,
        stops: best.stops,
      },
      searchedOrigins: duffel.quotes.map((q) => q.origin),
      message: `Live cash from ${best.origin}: $${best.totalAmountUsd} (${best.airline})`,
    },
  };
}
