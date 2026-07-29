/**
 * Repair stale trip start/end years (I35 / I37).
 * A 2025 Europe trip window remaps hotels BACK into 2025 after correctPast
 * bumps them to 2026 — Stay Gaps then show check-in 2025-09-01.
 */

import { dateOnly } from "@/lib/travelAssistant/tripWindow";
import { correctPastTravelIsoDate } from "@/lib/travelAssistant/travelDateCorrection";

export interface TripWindowRepairResult {
  startDate: string;
  endDate: string;
  changed: boolean;
}

/**
 * Roll trip bounds out of the past, then ensure they span reservation dates
 * (month/day aligned) when reservations already live in the future year.
 */
export function reconcileTripWindowDates(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  reservationDates: Array<string | null | undefined> = [],
  referenceDate = new Date(),
): TripWindowRepairResult {
  const rawStart = dateOnly(tripStartDate);
  const rawEnd = dateOnly(tripEndDate);
  let start = rawStart ? correctPastTravelIsoDate(rawStart, referenceDate) : "";
  let end = rawEnd ? correctPastTravelIsoDate(rawEnd, referenceDate) : "";

  const days = reservationDates
    .map((d) => dateOnly(d))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/u.test(d))
    .map((d) => correctPastTravelIsoDate(d, referenceDate))
    .sort();

  if (days.length > 0) {
    const minRes = days[0]!;
    const maxRes = days[days.length - 1]!;
    if (!start || start > minRes) start = minRes;
    if (!end || end < maxRes) end = maxRes;
    // If start/end still disagree on year with the reservation cluster, snap by month/day.
    if (start && minRes.slice(0, 4) !== start.slice(0, 4)) {
      const candidate = `${minRes.slice(0, 4)}-${start.slice(5)}`;
      if (candidate <= minRes) start = candidate;
      else start = minRes;
    }
    if (end && maxRes.slice(0, 4) !== end.slice(0, 4)) {
      const candidate = `${maxRes.slice(0, 4)}-${end.slice(5)}`;
      if (candidate >= maxRes) end = candidate;
      else end = maxRes;
    }
  }

  if (start && end && end < start) {
    end = start;
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
