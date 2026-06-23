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
      marketingCarrier: carrierIataFromAirline(quote.airline),
      flightNumber: quote.flightNumber ?? "—",
    },
  ];
}

function carrierIataFromAirline(airline: string): string {
  const lower = airline.toLowerCase();
  if (lower.includes("alaska")) return "AS";
  if (lower.includes("american")) return "AA";
  if (lower.includes("united")) return "UA";
  if (lower.includes("delta")) return "DL";
  if (lower.includes("jetblue")) return "B6";
  if (lower.includes("southwest")) return "WN";
  if (lower.includes("british")) return "BA";
  if (lower.includes("lufthansa")) return "LH";
  if (lower.includes("air france")) return "AF";
  if (lower.includes("ita")) return "AZ";
  return airline.slice(0, 2).toUpperCase() || "XX";
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
    airlineName: quote.airline,
  }));
}
