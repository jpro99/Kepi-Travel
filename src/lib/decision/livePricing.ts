import type { DecisionBrief, TravelStrategy } from "@/lib/decision/types";
import type { DuffelSearchResult } from "@/lib/providers/duffel/types";
import { rankStrategiesByValue } from "@/lib/decision/strategyRanking";
import type { TravelerGenome } from "@/lib/traveler/types";

function stopLabel(stops: number): string {
  return stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`;
}

export interface ConnectorDuffelQuote {
  legId: string;
  result: DuffelSearchResult;
}

function applyRoundTripToDirectStrategy(
  strategy: TravelStrategy,
  outboundQuote: DuffelSearchResult["quotes"][number],
  returnQuote?: DuffelSearchResult["quotes"][number],
  connectorQuotes: Array<{
    legId: string;
    quote: DuffelSearchResult["quotes"][number];
  }> = [],
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
  for (const connector of connectorQuotes) {
    segments.push({
      mode: "flight" as const,
      label: `${connector.quote.origin} → ${connector.quote.destination}`,
      detail: `${connector.quote.airline} · ${stopLabel(connector.quote.stops)} · live Duffel connector`,
      costUsd: connector.quote.totalAmountUsd,
    });
  }
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

  const connectorCash = connectorQuotes.reduce((sum, item) => sum + item.quote.totalAmountUsd, 0);
  const driveCost = otherSegments.reduce((sum, segment) => sum + segment.costUsd, 0);
  const trueOutOfPocket = Math.round(
    outboundQuote.totalAmountUsd +
      (returnQuote?.totalAmountUsd ?? flightSegments[1]?.costUsd ?? 0) +
      connectorCash +
      driveCost,
  );

  const connectorSummary =
    connectorQuotes.length > 0
      ? ` + ${connectorQuotes.length} connector leg${connectorQuotes.length > 1 ? "s" : ""}`
      : "";

  const headline = returnQuote
    ? `${outboundQuote.origin} → ${outboundQuote.destination} · ${returnQuote.origin} → ${returnQuote.destination}${connectorSummary} · $${trueOutOfPocket.toLocaleString()} RT cash`
    : `${outboundQuote.origin} → ${outboundQuote.destination} · ${stopLabel(outboundQuote.stops)} · $${outboundQuote.totalAmountUsd.toLocaleString()} cash`;

  const connectorReason =
    connectorQuotes.length > 0
      ? ` Connectors: ${connectorQuotes.map((item) => `${item.quote.origin}→${item.quote.destination} $${item.quote.totalAmountUsd}`).join("; ")}.`
      : "";

  return {
    ...strategy,
    headline,
    reasoning: returnQuote
      ? `Live Duffel round-trip: outbound ${outboundQuote.airline} $${outboundQuote.totalAmountUsd}, return ${returnQuote.airline} $${returnQuote.totalAmountUsd}.${connectorReason}`
      : `Live cash fare from Duffel (${outboundQuote.airline}, ${outboundQuote.departureDate}). Compared against miles and reposition strategies in your genome.${connectorReason}`,
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
  connectorDuffel: ConnectorDuffelQuote[] = [],
): DecisionBrief {
  const outboundBest = outboundDuffel.quotes[0];
  const returnBest = returnDuffel?.quotes[0];

  const connectorOffers = connectorDuffel
    .map(({ legId, result }) => {
      const quote = result.quotes[0];
      if (!quote) return null;
      return {
        legId,
        origin: quote.origin,
        destination: quote.destination,
        amount: quote.totalAmountUsd,
        currency: quote.currency,
        airline: quote.airline,
        stops: quote.stops,
        offerId: quote.offerId,
        flightNumber: quote.flightNumber,
        departureDate: quote.departureDate,
      };
    })
    .filter((offer): offer is NonNullable<typeof offer> => offer !== null);

  const connectorQuotePairs = connectorOffers.map((offer) => ({
    legId: offer.legId,
    quote: {
      origin: offer.origin,
      destination: offer.destination,
      totalAmountUsd: offer.amount,
      currency: offer.currency,
      airline: offer.airline,
      stops: offer.stops,
      departureDate: offer.departureDate,
      offerId: offer.offerId ?? "",
      flightNumber: offer.flightNumber,
      cabinClass: "economy",
    },
  }));

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
      ? applyRoundTripToDirectStrategy(
          strategy,
          outboundBest,
          returnBest,
          connectorQuotePairs,
        )
      : strategy,
  );

  strategies = rankStrategiesByValue(strategies, genome, comfortWeight);

  const connectorTotalUsd = connectorOffers.reduce((sum, offer) => sum + offer.amount, 0);
  const roundTripTotalUsd = returnBest
    ? outboundBest.totalAmountUsd + returnBest.totalAmountUsd + connectorTotalUsd
    : outboundBest.totalAmountUsd + connectorTotalUsd;

  const connectorMessage =
    connectorOffers.length > 0
      ? ` + ${connectorOffers.length} connector${connectorOffers.length > 1 ? "s" : ""} $${connectorTotalUsd}`
      : "";

  return {
    ...brief,
    strategies,
    strategyCatalog: brief.strategyCatalog?.map((strategy) =>
      strategy.kind === "direct_cash"
        ? applyRoundTripToDirectStrategy(
            strategy,
            outboundBest,
            returnBest,
            connectorQuotePairs,
          )
        : strategy,
    ),
    livePricing: {
      source: "duffel",
      configured: true,
      quotesFound:
        outboundDuffel.quotes.length +
        (returnDuffel?.quotes.length ?? 0) +
        connectorOffers.length,
      bestOffer: {
        origin: outboundBest.origin,
        destination: outboundBest.destination,
        amount: outboundBest.totalAmountUsd,
        currency: outboundBest.currency,
        airline: outboundBest.airline,
        stops: outboundBest.stops,
        offerId: outboundBest.offerId || undefined,
        flightNumber: outboundBest.flightNumber,
        departureDate: outboundBest.departureDate,
      },
      returnOffer: returnBest
        ? {
            origin: returnBest.origin,
            destination: returnBest.destination,
            amount: returnBest.totalAmountUsd,
            currency: returnBest.currency,
            airline: returnBest.airline,
            stops: returnBest.stops,
            offerId: returnBest.offerId || undefined,
            flightNumber: returnBest.flightNumber,
            departureDate: returnBest.departureDate,
          }
        : undefined,
      connectorOffers: connectorOffers.length > 0 ? connectorOffers : undefined,
      roundTripTotalUsd,
      searchedOrigins: [
        ...outboundDuffel.quotes.map((quote) => quote.origin),
        ...(returnDuffel?.quotes.map((quote) => quote.origin) ?? []),
        ...connectorOffers.map((offer) => offer.origin),
      ],
      message: returnBest
        ? `Live RT cash: out $${outboundBest.totalAmountUsd} (${outboundBest.airline}) + return $${returnBest.totalAmountUsd} (${returnBest.airline})${connectorMessage}`
        : `Live cash from ${outboundBest.origin}: $${outboundBest.totalAmountUsd} (${outboundBest.airline})${connectorMessage}`,
    },
  };
}
