/** Date-only helpers for trip windows and smart email matching. */

/** Max storable minutes-to-departure (~365 days). Trips planned further out still count down correctly until within range. */
export const MAX_MINUTES_TO_DEPARTURE = 525_600;

export function clampMinutesToDeparture(value: number | null | undefined, fallback = 180): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(MAX_MINUTES_TO_DEPARTURE, Math.round(value)));
}

export function dateOnly(value: string | undefined | null): string {
  return value?.trim().slice(0, 10) ?? "";
}

/** True when localTime carries a full scheduled departure (not date-only). */
export function hasCompleteFlightLocalTime(localTime: string | undefined | null): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u.test(localTime?.trim() ?? "");
}

export interface CanonicalFlightScheduleFields {
  localTime?: string;
  flightDate?: string;
  flightDepartureTime?: string;
}

/**
 * Prefer localTime when it disagrees with stale flightDate / flightDepartureTime
 * (email-forward bleed from purchase or send dates).
 */
export function canonicalFlightDepartureDay(reservation: CanonicalFlightScheduleFields): string {
  const localDay = dateOnly(reservation.localTime);
  if (hasCompleteFlightLocalTime(reservation.localTime) && localDay) {
    const flightDay = dateOnly(reservation.flightDate);
    const departureDay = dateOnly(reservation.flightDepartureTime);
    if (flightDay && flightDay !== localDay) return localDay;
    if (departureDay && departureDay !== localDay) return localDay;
    return localDay;
  }
  return dateOnly(reservation.flightDate) || dateOnly(reservation.flightDepartureTime) || localDay;
}

/** Best local departure timestamp for sorting, countdowns, and journey phase. */
export function canonicalFlightDepartureLocalTime(reservation: CanonicalFlightScheduleFields): string {
  const local = reservation.localTime?.trim() ?? "";
  const localDay = dateOnly(local);
  if (hasCompleteFlightLocalTime(local)) {
    const flightDay = dateOnly(reservation.flightDate);
    const departureDay = dateOnly(reservation.flightDepartureTime);
    if ((flightDay && flightDay !== localDay) || (departureDay && departureDay !== localDay)) {
      return local;
    }
    return local;
  }
  const departure = reservation.flightDepartureTime?.trim() ?? "";
  if (hasCompleteFlightLocalTime(departure.replace("T", " "))) {
    return departure.replace("T", " ").slice(0, 16);
  }
  const day = canonicalFlightDepartureDay(reservation);
  if (!day) return local;
  const timeMatch = /(\d{2}:\d{2})/u.exec(departure || local);
  return `${day} ${timeMatch?.[1] ?? "12:00"}`;
}

export function reservationPrimaryDate(reservation: {
  type?: string;
  localTime?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  checkOutDate?: string;
}): string {
  if (reservation.type === "flight") {
    return canonicalFlightDepartureDay(reservation);
  }
  if (reservation.type === "hotel") {
    return dateOnly(reservation.localTime);
  }
  return dateOnly(reservation.localTime);
}

export function reservationWithinTripWindow(
  reservationDate: string,
  tripStart: string,
  tripEnd: string,
  paddingDays = 2,
): boolean {
  const day = dateOnly(reservationDate);
  const start = dateOnly(tripStart);
  const end = dateOnly(tripEnd);
  if (!day || !start || !end) return true;
  const padStart = shiftIsoDate(start, -paddingDays);
  const padEnd = shiftIsoDate(end, paddingDays);
  return day >= padStart && day <= padEnd;
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const base = Date.parse(`${isoDate}T12:00:00`);
  if (Number.isNaN(base)) return isoDate;
  const next = new Date(base);
  next.setDate(next.getDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export function computeMinutesToDeparture(args: {
  startDate?: string | null;
  reservations?: Array<{ type?: string; localTime?: string; flightDate?: string; flightDepartureTime?: string }>;
  nowMs?: number;
}): number | null {
  const nowMs = args.nowMs ?? Date.now();
  const flightDates: string[] = [];
  for (const reservation of args.reservations ?? []) {
    if (reservation.type !== "flight") continue;
    const day = canonicalFlightDepartureDay(reservation);
    if (day) flightDates.push(day);
  }
  flightDates.sort();
  const targetDay = flightDates[0] ?? dateOnly(args.startDate);
  if (!targetDay) return null;
  const targetMs = Date.parse(`${targetDay}T09:00:00`);
  if (Number.isNaN(targetMs)) return null;
  return Math.max(0, Math.round((targetMs - nowMs) / 60_000));
}

export function isTripShellConfigured(trip: {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}): boolean {
  const destination = trip.destination?.trim() ?? "";
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);
  const name = trip.name?.trim() ?? "";
  if (!start || !end) return false;
  if (!destination || destination.toLowerCase() === "set destination") return false;
  if (/^trip \d+$/i.test(name)) return false;
  return true;
}
