import { allocateStopDates } from "@/lib/decision/stopDates";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { buildEstimatedStays } from "@/lib/providers/duffel/fallbackStays";

export interface TripHotelEstimate {
  totalCashUsd: number;
  stops: Array<{ stopName: string; nights: number; cashUsd: number }>;
  source: "estimated";
}

/** Cheapest estimated stay per stop — included in grand total for fair comparison. */
export function estimateTripHotels(intent: TripIntent, genome: TravelerGenome): TripHotelEstimate {
  const chainPriority = genome.hotelChainPriority;
  const stopRanges = allocateStopDates(intent);
  const stops: TripHotelEstimate["stops"] = [];

  if (stopRanges.length === 0) {
    const quotes = buildEstimatedStays({
      destinationIata: intent.destinationIata,
      destinationCity: intent.destination,
      nights: Math.max(1, intent.nights),
      chainPriority,
    });
    const cheapest = quotes[0]?.totalAmountUsd ?? Math.max(1, intent.nights) * 165;
    stops.push({
      stopName: intent.destination,
      nights: Math.max(1, intent.nights),
      cashUsd: Math.round(cheapest),
    });
  } else {
    for (const range of stopRanges) {
      const iata = range.stop.iata ?? intent.destinationIata;
      const quotes = buildEstimatedStays({
        destinationIata: iata,
        destinationCity: range.stop.name,
        nights: range.nights,
        chainPriority,
      });
      const cheapest = quotes[0]?.totalAmountUsd ?? range.nights * 165;
      stops.push({
        stopName: range.stop.name,
        nights: range.nights,
        cashUsd: Math.round(cheapest),
      });
    }
  }

  return {
    totalCashUsd: stops.reduce((sum, stop) => sum + stop.cashUsd, 0),
    stops,
    source: "estimated",
  };
}
