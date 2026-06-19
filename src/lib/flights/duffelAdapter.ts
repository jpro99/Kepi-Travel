import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import type { CashOffer, CabinClass, FusedSearchParams } from "@/lib/flights/types";

function segmentFromQuote(
  quote: {
    origin: string;
    destination: string;
    departureDate: string;
    airline: string;
    flightNumber?: string;
    stops: number;
  },
  cabin: CabinClass,
): CashOffer["segments"] {
  const departHour = 6 + Math.min(quote.stops * 2, 8);
  const arriveHour = departHour + 6 + quote.stops * 2;
  return [
    {
      origin: quote.origin,
      destination: quote.destination,
      departingAt: `${quote.departureDate}T${String(departHour).padStart(2, "0")}:00:00Z`,
      arrivingAt: `${quote.departureDate}T${String(arriveHour).padStart(2, "0")}:00:00Z`,
      marketingCarrier: quote.airline.slice(0, 2).toUpperCase() || "XX",
      flightNumber: quote.flightNumber ?? "—",
    },
  ];
}

/** Wraps existing Command Deck Duffel search — maps quotes to v2 CashOffer. */
export async function fetchDuffelCashOffers(params: FusedSearchParams): Promise<CashOffer[]> {
  const cabin = params.cabin ?? "economy";
  const result = await searchDuffelCashQuotes({
    origins: [params.origin],
    destination: params.destination,
    departureDate: params.departDate,
    cabinClass: cabin,
  });

  if (!result.configured || result.quotes.length === 0) {
    return [];
  }

  return result.quotes.map((quote) => ({
    kind: "cash" as const,
    id: quote.offerId || `${quote.origin}-${quote.destination}-${quote.departureDate}`,
    totalAmount: Math.round(quote.totalAmountUsd * 100 * Math.max(1, params.passengers)),
    currency: quote.currency || "USD",
    cabin,
    segments: segmentFromQuote(quote, cabin),
    source: "duffel" as const,
  }));
}
