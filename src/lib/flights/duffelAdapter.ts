import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import type { CashOffer, FlightCabin } from "@/lib/flights/types";

export interface DuffelCashSearchParams {
  origins: string[];
  destination: string;
  departureDate: string;
  cabin?: FlightCabin;
}

/** Wraps existing Command Deck Duffel search — maps quotes to CashOffer. */
export async function fetchDuffelCashOffers(params: DuffelCashSearchParams): Promise<{
  configured: boolean;
  offers: CashOffer[];
}> {
  const cabin = params.cabin ?? "economy";
  const result = await searchDuffelCashQuotes({
    origins: params.origins,
    destination: params.destination,
    departureDate: params.departureDate,
    cabinClass: cabin,
  });

  if (!result.configured) {
    return { configured: false, offers: [] };
  }

  const offers: CashOffer[] = result.quotes.map((quote) => ({
    id: quote.offerId || `${quote.origin}-${quote.destination}-${quote.departureDate}`,
    origin: quote.origin,
    destination: quote.destination,
    departureDate: quote.departureDate,
    airline: quote.airline,
    flightNumber: quote.flightNumber,
    stops: quote.stops,
    cabin,
    totalUsd: quote.totalAmountUsd,
    currency: quote.currency,
    offerId: quote.offerId,
    source: "duffel",
  }));

  return { configured: true, offers };
}
