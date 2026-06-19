import type { FlightLegPlan, PlanMode, TravelStrategy, TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { resolveSearchAirports } from "@/lib/decision/tripOrigins";

export type DateFlexDays = 3 | 7 | 14;

export interface ExpertDeckOptions {
  enabled?: boolean;
  originIata?: string;
  cppFloor?: number;
  dateFlexDays?: DateFlexDays;
  pointsProgram?: string;
  legDateOverrides?: Record<string, string>;
}

export const DATE_FLEX_SHIFTS: Record<DateFlexDays, readonly number[]> = {
  3: [-3, -2, -1, 0, 1, 2, 3],
  7: [-7, -5, -3, 0, 3, 5, 7],
  14: [-14, -10, -7, -3, 0, 3, 7, 10, 14],
};

export function resolveExpertSearchAirports(
  intent: TripIntent,
  genome: TravelerGenome,
  expert?: ExpertDeckOptions,
): string[] {
  if (expert?.originIata) {
    return [expert.originIata.toUpperCase()];
  }
  return resolveSearchAirports(intent, genome);
}

export function applyLegDateOverrides(
  legs: FlightLegPlan[],
  overrides?: Record<string, string>,
): FlightLegPlan[] {
  if (!overrides || Object.keys(overrides).length === 0) return legs;
  return legs.map((leg) => {
    const nextDate = overrides[leg.id];
    if (!nextDate) return leg;
    return { ...leg, departureDate: nextDate };
  });
}

export function buildRankExplanation(
  strategy: TravelStrategy,
  rank: number,
  best: TravelStrategy | undefined,
  genome: TravelerGenome,
): string {
  const total = strategy.scores.totalTripValue ?? strategy.scores.trueOutOfPocket;
  const cash = strategy.scores.trueOutOfPocket;
  const cpp = strategy.scores.bestCpp ?? 0;

  if (rank === 1) {
    const cppLine = cpp > 0 ? ` Best flight redemption ${cpp}¢/mi.` : "";
    return `Ranked #1 — lowest total trip value ($${total.toLocaleString()}): $${cash.toLocaleString()} cash out.${cppLine}`;
  }

  const bestKey = best?.scores.sortKey ?? best?.scores.totalTripValue ?? best?.scores.trueOutOfPocket ?? 0;
  const thisKey = strategy.scores.sortKey ?? total;
  const delta = Math.max(0, Math.round(thisKey - bestKey));
  const statusNote =
    strategy.kind === "status_play" && genome.statuses.length > 0
      ? " Status benefits may outweigh the gap."
      : "";
  return `Ranked #${rank} — $${delta.toLocaleString()} higher total value than #1 (${best?.title ?? "top pick"}). ${strategy.kind.replace(/_/g, " ")} routing.${statusNote}`;
}

export function attachRankExplanations(
  strategies: TravelStrategy[],
  genome: TravelerGenome,
): TravelStrategy[] {
  const best = strategies[0];
  return strategies.map((strategy, index) => ({
    ...strategy,
    rankExplanation: buildRankExplanation(strategy, index + 1, best, genome),
  }));
}

export function filterStrategiesByCppFloor(
  strategies: TravelStrategy[],
  cppFloor?: number,
): TravelStrategy[] {
  if (!cppFloor || cppFloor <= 0) return strategies;
  return strategies.filter((strategy) => {
    const cpp = strategy.scores.bestCpp ?? 0;
    if (cpp <= 0) return true;
    return cpp >= cppFloor;
  });
}

export function expertPlaceholder(planMode: PlanMode): string {
  switch (planMode) {
    case "hotels":
      return "Where are you staying? e.g. Bari, Venice, Dolomites in September — 2 nights each.";
    case "full":
      return "Full trip: West Coast to Bari, Venice, Dolomites — fly home from Munich. Hyatt loyalist.";
    default:
      return "West Coast to Bari, Venice, Dolomites, Germany — fly home from Munich. Alaska Gold.";
  }
}
