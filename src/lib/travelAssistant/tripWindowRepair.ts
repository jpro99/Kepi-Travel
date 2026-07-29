/**
 * Repair stale trip start/end years (I35 / I37 / I38).
 * Never expand the window to min/max across every raw reservation date —
 * that mixed 2025 leftovers with 2026 flights and produced "292 nights open".
 */

import { dateOnly } from "@/lib/travelAssistant/tripWindow";
import { correctPastTravelIsoDate } from "@/lib/travelAssistant/travelDateCorrection";

/** Hard cap for a single trip sleep/planning window (nights). */
export const MAX_TRIP_WINDOW_DAYS = 90;

export interface TripWindowRepairResult {
  startDate: string;
  endDate: string;
  changed: boolean;
}

function yearOf(day: string): number {
  return Number.parseInt(day.slice(0, 4), 10);
}

/** Year with the most reservation dates (ties → later year). */
export function dominantReservationYear(days: string[]): number | null {
  if (days.length === 0) return null;
  const counts = new Map<number, number>();
  for (const day of days) {
    const y = yearOf(day);
    if (!Number.isFinite(y)) continue;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let bestYear: number | null = null;
  let bestCount = -1;
  for (const [y, count] of counts) {
    if (count > bestCount || (count === bestCount && bestYear != null && y > bestYear)) {
      bestYear = y;
      bestCount = count;
    }
  }
  return bestYear;
}

function remapMonthDayToYear(day: string, year: number): string {
  return `${year}-${day.slice(5)}`;
}

function addDaysIso(day: string, days: number): string {
  const ms = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function spanDays(start: string, end: string): number {
  const a = Date.parse(`${start}T12:00:00Z`);
  const b = Date.parse(`${end}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Roll trip bounds out of the past, snap to the dominant reservation year,
 * and expand only within that cluster — never a year-long franken-window.
 */
export function reconcileTripWindowDates(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  reservationDates: Array<string | null | undefined> = [],
  referenceDate = new Date(),
): TripWindowRepairResult {
  const rawStart = dateOnly(tripStartDate);
  const rawEnd = dateOnly(tripEndDate);

  const correctedDays = reservationDates
    .map((d) => dateOnly(d))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/u.test(d))
    .map((d) => correctPastTravelIsoDate(d, referenceDate))
    .sort();

  const dominantYear = dominantReservationYear(correctedDays);
  const cluster = dominantYear
    ? correctedDays.filter((d) => yearOf(d) === dominantYear)
    : correctedDays;

  let start = rawStart ? correctPastTravelIsoDate(rawStart, referenceDate) : "";
  let end = rawEnd ? correctPastTravelIsoDate(rawEnd, referenceDate) : "";

  if (dominantYear) {
    if (start && yearOf(start) !== dominantYear) {
      start = remapMonthDayToYear(start, dominantYear);
    }
    if (end && yearOf(end) !== dominantYear) {
      end = remapMonthDayToYear(end, dominantYear);
    }
  }

  if (cluster.length > 0) {
    const minRes = cluster[0]!;
    const maxRes = cluster[cluster.length - 1]!;
    if (!start) start = minRes;
    if (!end) end = maxRes;
    // Pull bounds inward/outward only within the dominant cluster.
    if (start > minRes) start = minRes;
    if (end < maxRes) end = maxRes;
    if (start < minRes && yearOf(start) === yearOf(minRes)) {
      // keep earlier trip start in same year (pre-trip home days)
    } else if (yearOf(start) !== yearOf(minRes)) {
      start = minRes;
    }
    if (end > maxRes && yearOf(end) === yearOf(maxRes)) {
      // keep later trip end in same year
    } else if (yearOf(end) !== yearOf(maxRes)) {
      end = maxRes;
    }
  }

  if (start && end && end < start) {
    end = start;
  }

  // Cap absurd spans (I38) — keep the start, clamp the end.
  if (start && end && spanDays(start, end) > MAX_TRIP_WINDOW_DAYS) {
    end = addDaysIso(start, MAX_TRIP_WINDOW_DAYS - 1);
  }

  return {
    startDate: start,
    endDate: end,
    changed: start !== rawStart || end !== rawEnd,
  };
}

/** Collect date keys from reservations for window repair. */
export function collectReservationDateKeys(
  reservations: Array<{
    type?: string;
    localTime?: string;
    flightDate?: string;
    flightDepartureTime?: string;
    flightArrivalTime?: string;
    checkOutDate?: string;
  }>,
): string[] {
  const keys: string[] = [];
  for (const r of reservations) {
    for (const value of [
      r.localTime,
      r.flightDate,
      r.flightDepartureTime,
      r.flightArrivalTime,
      r.checkOutDate,
    ]) {
      const day = dateOnly(value);
      if (day) keys.push(day);
    }
  }
  return keys;
}
