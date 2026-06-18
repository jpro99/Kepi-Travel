import type { DecisionBrief, TravelStrategy } from "@/lib/decision/types";
import type { DuffelSearchResult } from "@/lib/providers/duffel/types";
import { rankStrategiesByValue } from "@/lib/decision/strategyRanking";
import type { TravelerGenome } from "@/lib/traveler/types";

function stopLabel(stops: number): string {
  return stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`;
}

function applyRoundTripToDirectStrategy(
  strategy: TravelStrategy,
  outboundQuote: DuffelSearchResult["quotes"][number],
  returnQuote?: DuffelSearchResult["quotes"][number],
): TravelStrategy {
  const flightSegments = strategy.segments.filter((segment) => segment.mode === "flight");
  const otherSegments = strategy.segments.filter((segment) => segment.mode !== "flight");

  const outboundSegment = {
    mode: "flight" as const,
    label: `${outboundQuote.origin} → ${outboundQuote.destination}`,
    detail: `${outboundQuote.airline} · ${stopLabel(outboundQuote.stops)} · live Duffel out`,
    costUsd: outboundQuote.totalAmountUsd,
  };

  const segments = [outboundSegment];
  if (returnQuote) {
    segments.push({
      mode: "flight",
      label: `${returnQuote.origin} → ${returnQuote.destination}`,
      detail: `${returnQuote.airline} · ${stopLabel(returnQuote.stops)} · live Duffel return`,
      costUsd: returnQuote.totalAmountUsd,
    });
  } else {
    const modeledReturn = flightSegments[1];
    if (modeledReturn?.mode === "flight") {
      segments.push({
        mode: "flight",
        label: modeledReturn.label,
        detail: modeledReturn.detail,
        costUsd: modeledReturn.costUsd,
      });
    }
  }

  const driveCost = otherSegments.reduce((sum, segment) => sum + segment.costUsd, 0);
  const trueOutOfPocket = Math.round(
    outboundQuote.totalAmountUsd + (returnQuote?.totalAmountUsd ?? flightSegments[1]?.costUsd ?? 0) + driveCost,
  );

  const headline = returnQuote
    ? `${outboundQuote.origin} → ${outboundQuote.destination} · ${returnQuote.origin} → ${returnQuote.destination} · $${trueOutOfPocket.toLocaleString()} RT cash`
    : `${outboundQuote.origin} → ${outboundQuote.destination} · ${stopLabel(outboundQuote.stops)} · $${outboundQuote.totalAmountUsd.toLocaleString()} cash`;

  return {
    ...strategy,
    headline,
    reasoning: returnQuote
      ? `Live Duffel round-trip: outbound ${outboundQuote.airline} $${outboundQuote.totalAmountUsd}, return ${returnQuote.airline} $${returnQuote.totalAmountUsd}.`
      : `Live cash fare from Duffel (${outboundQuote.airline}, ${outboundQuote.departureDate}). Compared against miles and reposition strategies in your genome.`,
    segments: [...otherSegments, ...segments],
    departureAirports: [outboundQuote.origin],
    scores: {
      ...strategy.scores,
      trueOutOfPocket,
      valueScore: Math.min(100, Math.round(120 - trueOutOfPocket / 40)),
    },
  };
}

export function enrichBriefWithDuffelPricing(
  brief: DecisionBrief,
  outboundDuffel: DuffelSearchResult,
  genome: TravelerGenome,
  comfortWeight: number,
  returnDuffel?: DuffelSearchResult,
): DecisionBrief {
  const outboundBest = outboundDuffel.quotes[0];
  const returnBest = returnDuffel?.quotes[0];

  if (!outboundDuffel.configured || !outboundBest) {
    return {
      ...brief,
      livePricing: {
        source: "duffel",
        configured: outboundDuffel.configured,
        quotesFound: 0,
        message:
          outboundDuffel.error ??
          (outboundDuffel.configured ? "No offers" : "Add DUFFEL_ACCESS_TOKEN to .env.local"),
      },
    };
  }

  let strategies = brief.strategies.map((strategy) =>
    strategy.kind === "direct_cash"
      ? applyRoundTripToDirectStrategy(strategy, outboundBest, returnBest)
      : strategy,
  );

  strategies = rankStrategiesByValue(strategies, genome, comfortWeight);

  const roundTripTotalUsd = returnBest
    ? outboundBest.totalAmountUsd + returnBest.totalAmountUsd
    : outboundBest.totalAmountUsd;

  return {
    ...brief,
    strategies,
    livePricing: {
      source: "duffel",
      configured: true,
      quotesFound: outboundDuffel.quotes.length + (returnDuffel?.quotes.length ?? 0),
      bestOffer: {
        origin: outboundBest.origin,
        destination: outboundBest.destination,
        amount: outboundBest.totalAmountUsd,
        currency: outboundBest.currency,
        airline: outboundBest.airline,
        stops: outboundBest.stops,
      },
      returnOffer: returnBest
        ? {
            origin: returnBest.origin,
            destination: returnBest.destination,
            amount: returnBest.totalAmountUsd,
            currency: returnBest.currency,
            airline: returnBest.airline,
            stops: returnBest.stops,
          }
        : undefined,
      roundTripTotalUsd,
      searchedOrigins: [
        ...outboundDuffel.quotes.map((quote) => quote.origin),
        ...(returnDuffel?.quotes.map((quote) => quote.origin) ?? []),
      ],
      message: returnBest
        ? `Live RT cash: out $${outboundBest.totalAmountUsd} (${outboundBest.airline}) + return $${returnBest.totalAmountUsd} (${returnBest.airline})`
        : `Live cash from ${outboundBest.origin}: $${outboundBest.totalAmountUsd} (${outboundBest.airline})`,
    },
  };
}
