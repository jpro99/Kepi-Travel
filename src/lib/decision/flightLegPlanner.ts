import { allocateStopDates } from "@/lib/decision/stopDates";
import { prefersCarrierFromIntentOrGenome, resolvePrimaryOrigin } from "@/lib/decision/tripOrigins";
import type { FlightLegPlan, TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

/** Regions where multiple airports are plausible — triggers ask-back. */
export const AMBIGUOUS_STOP_AIRPORTS: Record<string, string[]> = {
  Dolomites: ["VCE", "INN", "MXP"],
  Germany: ["MUC", "BER", "FRA"],
};

/** Build searchable flight legs — long-haul outbound + return; connectors optional. */
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

  const stopDates = allocateStopDates(intent);
  const stops = intent.stops ?? [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const fromStop = stops[index]!;
    const toStop = stops[index + 1]!;
    if (!fromStop.iata || !toStop.iata) continue;
    const range = stopDates[index];
    legs.push({
      id: `connector-${index}`,
      role: "connector",
      fromIata: fromStop.iata.toUpperCase(),
      toIata: toStop.iata.toUpperCase(),
      fromLabel: fromStop.name,
      toLabel: toStop.name,
      enabled: false,
      optional: true,
      departureDate: range?.checkOut ?? intent.startDate,
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

export function applyLegEnabledOverrides(
  legs: FlightLegPlan[],
  enabledLegIds?: string[],
): FlightLegPlan[] {
  if (!enabledLegIds?.length) return legs;
  return legs.map((leg) => {
    if (!leg.optional) return leg;
    return { ...leg, enabled: enabledLegIds.includes(leg.id) };
  });
}

export function annotateLegLoyaltyNotes(
  legs: FlightLegPlan[],
  intent: TripIntent,
  genome: Pick<TravelerGenome, "statuses">,
): FlightLegPlan[] {
  if (!prefersCarrierFromIntentOrGenome(intent, genome, "alaska")) return legs;
  return legs.map((leg) => {
    if (leg.role !== "connector") return leg;
    const note =
      "No Alaska metal on this leg — partner cash or train is usually smarter.";
    return { ...leg, loyaltyNote: leg.enabled ? note : note };
  });
}

export function enabledLongHaulLegs(legs: FlightLegPlan[]): FlightLegPlan[] {
  return legs.filter((leg) => leg.enabled && leg.role !== "connector");
}

export function enabledConnectorLegs(legs: FlightLegPlan[]): FlightLegPlan[] {
  return legs.filter((leg) => leg.enabled && leg.role === "connector");
}

export function enabledSearchLegs(legs: FlightLegPlan[]): FlightLegPlan[] {
  return legs.filter((leg) => leg.enabled);
}

export function defaultEnabledLegIds(legs: FlightLegPlan[]): string[] {
  return legs.filter((leg) => leg.enabled).map((leg) => leg.id);
}

export function toggleLegEnabled(
  legs: FlightLegPlan[],
  legId: string,
): FlightLegPlan[] {
  return legs.map((leg) => {
    if (leg.id !== legId || !leg.optional) return leg;
    return { ...leg, enabled: !leg.enabled };
  });
}

/** Ask-back when a stop maps to a proxy airport with alternatives. */
export function ambiguousStopQuestions(intent: TripIntent): Array<{
  stopName: string;
  airports: string[];
}> {
  const questions: Array<{ stopName: string; airports: string[] }> = [];
  for (const stop of intent.stops ?? []) {
    const alts = AMBIGUOUS_STOP_AIRPORTS[stop.name];
    if (alts && alts.length > 1) {
      questions.push({ stopName: stop.name, airports: alts });
    }
  }
  return questions;
}
