import { airlineFromProvider } from "@/lib/travelFit/hubKnowledge";
import type {
  AirlineHabit,
  DestinationHabit,
  HotelChainHabit,
  LearnedTravelHabits,
  TravelFitReservation,
} from "@/lib/travelFit/types";

const CHAIN_PATTERNS: Array<{ pattern: RegExp; chain: string }> = [
  { pattern: /hyatt/i, chain: "Hyatt" },
  { pattern: /marriott|bonvoy|westin|sheraton|ritz/i, chain: "Marriott" },
  { pattern: /hilton|waldorf|conrad|curio/i, chain: "Hilton" },
  { pattern: /ihg|intercontinental|kimpton|holiday inn/i, chain: "IHG" },
  { pattern: /accor|sofitel|novotel/i, chain: "Accor" },
];

function detectChain(hotel: TravelFitReservation): string | null {
  const haystack = `${hotel.provider ?? ""} ${hotel.title ?? ""} ${hotel.location ?? ""}`;
  for (const { pattern, chain } of CHAIN_PATTERNS) {
    if (pattern.test(haystack)) return chain;
  }
  return null;
}

function confidenceFromCounts(flights: number, hotels: number): LearnedTravelHabits["confidence"] {
  const total = flights + hotels;
  if (total >= 12) return "strong";
  if (total >= 4) return "growing";
  return "low";
}

function learningMessage(confidence: LearnedTravelHabits["confidence"], tripCount: number): string {
  if (confidence === "low") {
    return "Kepi works great on day one — and gets sharper every trip. Add a few flights and hotels and we'll learn how you actually travel.";
  }
  if (confidence === "growing") {
    return `Kepi is learning your patterns (${tripCount} trip${tripCount === 1 ? "" : "s"} so far). Recommendations keep improving as you book and fly.`;
  }
  return "Kepi knows your travel habits well now — airline, hotel, and earn advice is tuned to how you actually move.";
}

/** Derive habits from reservations + optional home airports from genome. */
export function analyzeTravelHabits(input: {
  userId: string;
  reservations: TravelFitReservation[];
  homeAirports?: string[];
  storedHabits?: Partial<LearnedTravelHabits> | null;
}): LearnedTravelHabits {
  const flights = input.reservations.filter((r) => r.type === "flight");
  const hotels = input.reservations.filter((r) => r.type === "hotel");

  const airlineCounts = new Map<string, number>();
  for (const flight of flights) {
    const code =
      airlineFromProvider(flight.provider, flight.title) ??
      flight.provider?.slice(0, 2).toUpperCase() ??
      "??";
    airlineCounts.set(code, (airlineCounts.get(code) ?? 0) + 1);
  }

  const destCounts = new Map<string, { label: string; count: number }>();
  for (const flight of flights) {
    const dest = flight.flightArrivalAirport?.trim().toUpperCase();
    if (!dest) continue;
    const existing = destCounts.get(dest) ?? { label: dest, count: 0 };
    existing.count += 1;
    destCounts.set(dest, existing);
  }

  const chainStats = new Map<string, { count: number }>();
  for (const hotel of hotels) {
    const chain = detectChain(hotel) ?? "Independent";
    const stats = chainStats.get(chain) ?? { count: 0 };
    stats.count += 1;
    chainStats.set(chain, stats);
  }

  const flightSegmentCount = flights.length;
  const totalAirlineSegments = [...airlineCounts.values()].reduce((a, b) => a + b, 0) || 1;

  const topAirlines: AirlineHabit[] = [...airlineCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([airlineCode, segmentCount]) => ({
      airlineCode,
      label: airlineCode,
      segmentCount,
      share: Math.round((segmentCount / totalAirlineSegments) * 100),
    }));

  const topDestinations: DestinationHabit[] = [...destCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([iataOrCity, v]) => ({ iataOrCity, label: v.label, visitCount: v.count }));

  const topHotelChains: HotelChainHabit[] = [...chainStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([chain, stats]) => ({
      chain,
      stayCount: stats.count,
      avgNightlyUsd: null,
    }));

  const typicalHotelNightlyUsd = input.storedHabits?.typicalHotelNightlyUsd ?? null;
  const tripCount = Math.max(input.storedHabits?.tripCount ?? 0, hotels.length > 0 || flights.length > 0 ? 1 : 0);
  const confidence = confidenceFromCounts(flightSegmentCount, hotels.length);
  const primaryHomeAirports = (input.homeAirports ?? input.storedHabits?.primaryHomeAirports ?? []).map((a) =>
    a.toUpperCase(),
  );

  return {
    userId: input.userId,
    updatedAt: new Date().toISOString(),
    tripCount,
    flightSegmentCount,
    hotelStayCount: hotels.length,
    topAirlines,
    topDestinations,
    topHotelChains,
    typicalHotelNightlyUsd,
    primaryHomeAirports,
    confidence,
  };
}

export function habitsLearningCopy(habits: LearnedTravelHabits): string {
  return learningMessage(habits.confidence, habits.tripCount);
}

export { learningMessage };
