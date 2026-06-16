import type { DuffelFlightQuote } from "@/lib/providers/duffel/types";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";

export const DEFAULT_DATE_SHIFTS = [-7, -5, -3, 0, 3, 5, 7] as const;

export function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface FlexDateQuote extends DuffelFlightQuote {
  dateShiftDays: number;
}

export async function searchDuffelAcrossDates(input: {
  origins: string[];
  destination: string;
  baseDepartureDate: string;
  dateShifts?: readonly number[];
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
}): Promise<FlexDateQuote[]> {
  const shifts = input.dateShifts ?? DEFAULT_DATE_SHIFTS;
  const cabin = input.cabinClass ?? "economy";
  const destination = input.destination.toUpperCase();

  const results = await Promise.all(
    shifts.map(async (shift) => {
      const departureDate = shiftIsoDate(input.baseDepartureDate, shift);
      const search = await searchDuffelCashQuotes({
        origins: input.origins,
        destination,
        departureDate,
        cabinClass: cabin,
      });
      const best = search.quotes[0];
      if (!best) return null;
      return { ...best, dateShiftDays: shift };
    }),
  );

  const quotes = results.filter((q): q is FlexDateQuote => q !== null);
  quotes.sort((a, b) => a.totalAmountUsd - b.totalAmountUsd);
  return quotes;
}
