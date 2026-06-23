// Trip learning engine — Kepi gets smarter after every trip

export interface TripRating {
  tripId: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  ratings: {
    overallTrip: number;       // 1-5
    flightExperience?: number; // 1-5
    hotelSatisfaction?: number;// 1-5
    valueForMoney?: number;    // 1-5
  };
  feedback: {
    wouldReturn: boolean;
    bestPart?: string;
    wouldDodifferently?: string;
    recommendedForType?: ("business" | "family" | "romance" | "solo" | "adventure")[];
  };
  packingFeedback: {
    overPacked: boolean;
    underPacked: boolean;
    forgotItems?: string[];
    unnecessaryItems?: string[];
  };
  flightFeedback: {
    flightNumber?: string;
    airlineRating?: number;    // 1-5
    seatComfort?: number;      // 1-5
    onTime: boolean;
    delayMinutes?: number;
    wouldFlyAgain?: boolean;
  };
  hotelFeedback?: {
    hotelName?: string;
    rating: number;            // 1-5
    wouldStayAgain: boolean;
    pros?: string;
    cons?: string;
  };
  completedAt: string;
}

export interface TripInsights {
  // Destination preferences
  visitedDestinations: { iata: string; city: string; rating: number; wouldReturn: boolean; lastVisited: string }[];
  // Airline preferences (from actual experience)
  airlineRatings: Record<string, { rating: number; seatComfort: number; wouldFlyAgain: boolean; count: number }>;
  // Hotel brand preferences
  hotelRatings: Record<string, { rating: number; wouldStayAgain: boolean; count: number }>;
  // Packing insights
  packingPatterns: {
    frequentlyForgotten: string[];
    frequentlyUnused: string[];
    alwaysOverPacked: boolean;
  };
  // Travel patterns
  patterns: {
    preferredTripLength: number;       // avg nights
    preferredTripType: string;         // leisure/business/adventure
    peakTravelMonths: number[];        // 1-12
    totalTrips: number;
    totalCountries: number;
  };
  ratings: TripRating[];
}

export function extractInsights(ratings: TripRating[]): Partial<TripInsights> {
  if (!ratings.length) return {};

  // Airline ratings
  const airlineRatings: TripInsights["airlineRatings"] = {};
  for (const r of ratings) {
    const airline = r.flightFeedback.flightNumber?.match(/^([A-Z]{2})/)?.[1];
    if (airline && r.flightFeedback.airlineRating) {
      const existing = airlineRatings[airline] ?? { rating: 0, seatComfort: 0, wouldFlyAgain: true, count: 0 };
      existing.count += 1;
      existing.rating = ((existing.rating * (existing.count - 1)) + r.flightFeedback.airlineRating) / existing.count;
      existing.seatComfort = ((existing.seatComfort * (existing.count - 1)) + (r.flightFeedback.seatComfort ?? 3)) / existing.count;
      if (r.flightFeedback.wouldFlyAgain === false) existing.wouldFlyAgain = false;
      airlineRatings[airline] = existing;
    }
  }

  // Packing patterns
  const forgotten = ratings.flatMap(r => r.packingFeedback.forgotItems ?? []);
  const unused = ratings.flatMap(r => r.packingFeedback.unnecessaryItems ?? []);
  const overPackedCount = ratings.filter(r => r.packingFeedback.overPacked).length;

  const freq = (arr: string[]) => {
    const counts = arr.reduce((acc, item) => {
      const key = item.toLowerCase().trim();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).filter(([, n]) => n > 1).map(([item]) => item);
  };

  return {
    airlineRatings,
    packingPatterns: {
      frequentlyForgotten: freq(forgotten),
      frequentlyUnused: freq(unused),
      alwaysOverPacked: overPackedCount > ratings.length / 2,
    },
    patterns: {
      totalTrips: ratings.length,
      totalCountries: new Set(ratings.map(r => r.destination.slice(0, 2))).size,
      preferredTripLength: Math.round(ratings.filter(r => r.returnDate).reduce((sum, r) => {
        const nights = r.returnDate ? Math.ceil((new Date(r.returnDate).getTime() - new Date(r.departDate).getTime()) / 86_400_000) : 5;
        return sum + nights;
      }, 0) / Math.max(1, ratings.length)),
      preferredTripType: "leisure",
      peakTravelMonths: [...new Set(ratings.map(r => new Date(r.departDate).getMonth() + 1))].sort(),
    },
    ratings,
  };
}
