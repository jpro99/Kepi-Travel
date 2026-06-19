import type { PaymentMode, TravelStrategy } from "@/lib/decision/types";

export type { PaymentMode };

export function totalMiles(strategy: TravelStrategy): number {
  return strategy.segments.reduce((sum, segment) => sum + (segment.milesUsed ?? 0), 0);
}

export function flightCash(strategy: TravelStrategy): number {
  return strategy.segments
    .filter((segment) => segment.mode === "flight" || segment.mode === "drive")
    .reduce((sum, segment) => sum + segment.costUsd, 0);
}

export function matchesPaymentMode(strategy: TravelStrategy, mode: PaymentMode): boolean {
  const miles = totalMiles(strategy);
  const cash = flightCash(strategy);

  switch (mode) {
    case "cash":
      return strategy.kind === "direct_cash";
    case "points":
      return (
        (strategy.kind === "reposition_award" || strategy.kind === "instrument_play") &&
        miles >= 40_000 &&
        strategy.kind !== "direct_cash"
      );
    case "mix":
      return (
        strategy.kind === "instrument_play" ||
        (strategy.kind === "reposition_award" && miles > 0 && cash >= 50)
      );
    default:
      return true;
  }
}

/** Keep up to 3 strategies for the selected payment mode; fall back if empty. */
export function filterStrategiesByPaymentMode(
  strategies: TravelStrategy[],
  mode: PaymentMode,
): TravelStrategy[] {
  const filtered = strategies.filter((strategy) => matchesPaymentMode(strategy, mode));
  if (filtered.length > 0) {
    return filtered.slice(0, 3);
  }
  return strategies.slice(0, 3);
}

export function paymentModeLabel(mode: PaymentMode): string {
  switch (mode) {
    case "cash":
      return "Cash only";
    case "points":
      return "Points only";
    case "mix":
      return "Cash + points mix";
  }
}

export function paymentModeDescription(mode: PaymentMode): string {
  switch (mode) {
    case "cash":
      return "Live Duffel cash — lowest out-of-pocket.";
    case "points":
      return "Award-style routing — miles first, minimal cash.";
    case "mix":
      return "Feeder cash + miles long-haul — best of both.";
  }
}
