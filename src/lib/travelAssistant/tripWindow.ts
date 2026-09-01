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

function normalizeScheduleClock(value: string | undefined | null): string {
  return value?.trim().replace("T", " ").slice(0, 16) ?? "";
}

function clockMinutesFromMidnight(localTimeStr: string): number | null {
  const normalized = normalizeScheduleClock(localTimeStr);
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/u.exec(normalized);
  if (!match) return null;
  return Number.parseInt(match[2] ?? "", 10) * 60 + Number.parseInt(match[3] ?? "", 10);
}

/**
 * When localTime and flightDepartureTime disagree on the same day, prefer the later
 * booked clock. Live status / TZ bleed can pull localTime earlier; delay updates push
 * localTime later — max clock is the honest booked schedule (F15).
 */
export function resolveBookedDepartureLocalTime(reservation: CanonicalFlightScheduleFields): string {
  const local = normalizeScheduleClock(reservation.localTime);
  const departure = normalizeScheduleClock(reservation.flightDepartureTime);
  const localComplete = hasCompleteFlightLocalTime(local);
  const departureComplete = hasCompleteFlightLocalTime(departure);

  if (!localComplete && departureComplete) return departure;
  if (localComplete && !departureComplete) return local;
  if (!localComplete && !departureComplete) {
    return canonicalFlightDepartureLocalTime(reservation);
  }

  const localDay = dateOnly(local);
  const flightDay = dateOnly(reservation.flightDate);
  const departureDay = dateOnly(reservation.flightDepartureTime);
  if ((flightDay && flightDay !== localDay) || (departureDay && departureDay !== localDay)) {
    return local;
  }

  const departureDayFromField = dateOnly(departure);
  if (departureDayFromField && departureDayFromField !== localDay) {
    return departure;
  }

  const localMins = clockMinutesFromMidnight(local);
  const departureMins = clockMinutesFromMidnight(departure);
  if (
    localMins != null &&
    departureMins != null &&
    Math.abs(localMins - departureMins) > 30
  ) {
    return localMins >= departureMins ? local : departure;
  }

  return local;
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
    const departure = normalizeScheduleClock(reservation.flightDepartureTime);
    if (hasCompleteFlightLocalTime(departure)) {
      return resolveBookedDepartureLocalTime(reservation);
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

/**
 * Remap a day-plan date into a trip window by month/day when the year is wrong
 * (Word docs often say "SEPT 2–12" with no year, or a stale year).
 */
export function remapDayKeyIntoTripWindow(
  dateKey: string,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): string | null {
  const day = dateOnly(dateKey);
  const start = dateOnly(tripStartDate);
  const end = dateOnly(tripEndDate);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/u.test(day) || !start || !end) return null;
  if (reservationWithinTripWindow(day, start, end)) return day;

  const monthDay = day.slice(5); // MM-DD
  if (!/^\d{2}-\d{2}$/u.test(monthDay)) return null;
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;

  for (let year = startYear; year <= endYear; year += 1) {
    const candidate = `${year}-${monthDay}`;
    if (reservationWithinTripWindow(candidate, start, end)) return candidate;
  }
  return null;
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
