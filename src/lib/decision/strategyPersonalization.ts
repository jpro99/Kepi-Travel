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
  return intent.originAirports?.[0]?.toUpperCase() ?? genome.geoCluster.find((a) => a.isPrimary)?.iata ?? "LAX";
}

function arrivalAirport(intent: TripIntent): string {
  return intent.stops?.[0]?.iata ?? intent.destinationIata;
}

/** Rewrites playbook strategies to match parsed origin, destination, and optional multi-city intent. */
export function personalizeStrategiesForIntent(
  strategies: TravelStrategy[],
  intent: TripIntent,
  genome: TravelerGenome,
): TravelStrategy[] {
  const origin = originAirport(intent, genome);
  const arrival = arrivalAirport(intent);
  const primaryHotel = genome.hotelChainPriority[0] ?? "Hyatt";
  const preferAlaska = intent.preferredAirlines?.includes("Alaska");
  const route = intent.stops?.length ? formatStopRoute(intent.stops) : null;
  const loyaltyLine = [
    ...(intent.loyaltyPrograms ?? []),
    preferAlaska ? "Alaska metal preferred" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return strategies.map((strategy) => {
    let segments = intent.stops?.length
      ? replaceHotelSegments(strategy, intent, primaryHotel)
      : strategy.segments;

    segments = segments.map((seg) => {
      if (seg.mode !== "flight") return seg;
      if (seg.label.includes("→")) {
        const parts = seg.label.split("→").map((p) => p.trim());
        if (parts.length === 2 && parts[1] === arrival) {
          return { ...seg, label: `${parts[0]} → ${parts[1]}` };
        }
        if (parts.length === 2 && parts[0] !== origin && !parts[0]?.includes(origin)) {
          return seg;
        }
      }
      if (seg.label.includes(origin) && seg.label.includes(arrival)) return seg;
      return {
        ...seg,
        label: seg.label.includes("→") ? seg.label : `${origin} → ${arrival}`,
        detail: route
          ? `${seg.detail.split("·")[0]?.trim() ?? "Routing"} · ${route}`
          : seg.detail,
      };
    });

    let headline = strategy.headline;
    if (strategy.kind === "reposition_award") {
      headline = route ? `${origin} → ${arrival} · ${route}` : strategy.headline;
    } else if (strategy.kind === "direct_cash") {
      headline = `${origin} → ${arrival}${route ? ` · ${route}` : ""} · cash fare`;
    } else if (strategy.kind === "instrument_play") {
      headline = route ? `${origin} → ${route}` : `${origin} → ${arrival} · certs + points`;
    } else if (strategy.kind === "status_play") {
      headline = route
        ? `${origin} → ${arrival} · status earn · ${route}`
        : `${origin} → ${arrival} · status earn`;
    }

    let reasoning = strategy.reasoning;
    if (intent.originCity) {
      reasoning = reasoning.replace(/\b(LAX|ONT|SNA|SEA)\b/g, origin);
    }
    if (route) {
      reasoning = loyaltyLine
        ? `${reasoning} Multi-city: ${route}. ${loyaltyLine}.`
        : `${reasoning} Multi-city route: ${route}.`;
    } else if (loyaltyLine) {
      reasoning = `${reasoning} ${loyaltyLine}.`;
    }

    const departureAirports = [
      ...(intent.originAirports?.map((c) => c.toUpperCase()) ?? []),
      ...(strategy.departureAirports ?? []),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    return {
      ...strategy,
      headline,
      reasoning,
      segments,
      departureAirports: departureAirports.length > 0 ? departureAirports : [origin],
    };
  });
}
