/**
 * Pure helpers for Universal Airport Day Coach (AirportNavigatorFallback).
 * Departure-only for Task A — arrival mode derivation is a separate decision.
 */

export type DayCoachPathStep = {
  id: string;
  icon: string;
  text: string;
  detail?: string;
  minutes?: number;
};

/** Time-budget reassurance under the departure header. Null under 45m (amber countdown owns urgency). */
export function departureTimeBudgetReassurance(minutesToDeparture: number): string | null {
  const minutes = Math.round(minutesToDeparture);
  if (minutes >= 90) return `${minutes}m until departure · plenty of time`;
  if (minutes >= 45) return `${minutes}m until departure · you're on track`;
  return null;
}

/**
 * Coach view shows current + next step; full-day shows all.
 * Without completion tracking, current = index 0.
 */
export function selectDayCoachVisibleSteps<T>(
  steps: readonly T[],
  fullDayView: boolean,
): { visible: T[]; hiddenCount: number } {
  if (fullDayView || steps.length <= 2) {
    return { visible: [...steps], hiddenCount: 0 };
  }
  return { visible: steps.slice(0, 2) as T[], hiddenCount: steps.length - 2 };
}