import { resolvePrimaryOrigin } from "@/lib/decision/tripOrigins";
import type { FlightLegPlan, TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

/** Build searchable flight legs — Phase 1: long-haul outbound + return only; connectors stubbed off. */
export function buildFlightLegsFromIntent(
  intent: TripIntent,
  genome?: TravelerGenome,
): FlightLegPlan[] {
  const legs: FlightLegPlan[] = [];
  const homeIata =
    intent.originAirports?.[0]?.toUpperCase() ??
    (genome ? resolvePrimaryOrigin(intent, genome) : null);
  const arrivalIata = (intent.stops?.[0]?.iata ?? intent.destinationIata).toUpperCase();
  const returnIata = intent.returnAirports?.[0]?.toUpperCase();

  if (homeIata && arrivalIata) {
    legs.push({
      id: "outbound",
      role: "outbound",
      fromIata: homeIata,
      toIata: arrivalIata,
      fromLabel: intent.originCity ?? homeIata,
      toLabel: intent.stops?.[0]?.name ?? intent.destination,
      enabled: true,
      optional: false,
      departureDate: intent.startDate,
    });
  }

  const stops = intent.stops ?? [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const fromStop = stops[index]!;
    const toStop = stops[index + 1]!;
    if (!fromStop.iata || !toStop.iata) continue;
    legs.push({
      id: `connector-${index}`,
      role: "connector",
      fromIata: fromStop.iata.toUpperCase(),
      toIata: toStop.iata.toUpperCase(),
      fromLabel: fromStop.name,
      toLabel: toStop.name,
      enabled: false,
      optional: true,
      departureDate: intent.startDate,
    });
  }

  if (returnIata && homeIata) {
    legs.push({
      id: "return",
      role: "return",
      fromIata: returnIata,
      toIata: homeIata,
      fromLabel: intent.returnCity ?? returnIata,
      toLabel: intent.originCity ?? homeIata,
      enabled: true,
      optional: false,
      departureDate: intent.endDate,
    });
  }

  return legs;
}

export function enabledLongHaulLegs(legs: FlightLegPlan[]): FlightLegPlan[] {
  return legs.filter((leg) => leg.enabled && leg.role !== "connector");
}
