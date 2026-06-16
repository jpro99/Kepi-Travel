import { formatStopRoute } from "@/lib/decision/stopDates";
import type { TravelStrategy, TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

function replaceHotelSegments(
  strategy: TravelStrategy,
  intent: TripIntent,
  primaryHotel: string,
): TravelStrategy["segments"] {
  const nonHotel = strategy.segments.filter((s) => s.mode !== "hotel");
  const hotelSegments = (intent.stops ?? []).map((stop) => ({
    mode: "hotel" as const,
    label: `${primaryHotel} ${stop.name}`,
    detail: stop.nightsLabel
      ? `${stop.nightsLabel} · ${primaryHotel} points or cash`
      : `${stop.nights ?? "?"} nights · ${primaryHotel}`,
    costUsd: 0,
    milesUsed: (stop.nights ?? 3) * 21_000,
    cpp: 1.7,
  }));
  if (hotelSegments.length === 0) return strategy.segments;
  return [...nonHotel, ...hotelSegments];
}

function originAirport(intent: TripIntent, genome: TravelerGenome): string {
  return intent.originAirports?.[0] ?? genome.geoCluster.find((a) => a.isPrimary)?.iata ?? "LAX";
}

function arrivalAirport(intent: TripIntent): string {
  return intent.stops?.[0]?.iata ?? intent.destinationIata;
}

/** Rewrites playbook strategies to match a parsed multi-city intent. */
export function personalizeStrategiesForIntent(
  strategies: TravelStrategy[],
  intent: TripIntent,
  genome: TravelerGenome,
): TravelStrategy[] {
  if (!intent.stops?.length) return strategies;

  const route = formatStopRoute(intent.stops);
  const origin = originAirport(intent, genome);
  const arrival = arrivalAirport(intent);
  const primaryHotel = genome.hotelChainPriority[0] ?? "Hyatt";
  const preferAlaska = intent.preferredAirlines?.includes("Alaska");
  const loyaltyLine = [
    ...(intent.loyaltyPrograms ?? []),
    preferAlaska ? "Alaska metal preferred" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return strategies.map((strategy) => {
    const segments = replaceHotelSegments(strategy, intent, primaryHotel);
    const flightSeg = segments.find((s) => s.mode === "flight");
    const updatedFlight = flightSeg
      ? {
          ...flightSeg,
          label: `${origin} → ${arrival}`,
          detail: preferAlaska
            ? `${flightSeg.detail.split("·")[0]?.trim() ?? "Partner"} · Alaska preferred · ${route}`
            : `${flightSeg.detail} · ${route}`,
        }
      : flightSeg;

    const nextSegments = segments.map((s) => (s.mode === "flight" && updatedFlight ? updatedFlight : s));

    let headline = strategy.headline;
    if (strategy.kind === "reposition_award") {
      headline = `${origin} → ${arrival} · ${route}`;
    } else if (strategy.kind === "direct_cash") {
      headline = `${origin} → ${arrival} · ${route}`;
    } else if (strategy.kind === "instrument_play") {
      headline = `${origin} → ${route}`;
    } else if (strategy.kind === "status_play") {
      headline = `${origin} → ${arrival} · status earn · ${route}`;
    }

    const reasoning = loyaltyLine
      ? `${strategy.reasoning} Multi-city: ${route}. ${loyaltyLine}.`
      : `${strategy.reasoning} Multi-city route: ${route}.`;

    return {
      ...strategy,
      headline,
      reasoning,
      segments: nextSegments,
      departureAirports: [origin, ...(strategy.departureAirports ?? [])].filter(
        (v, i, arr) => arr.indexOf(v) === i,
      ),
    };
  });
}
