const GRACE_DAYS = 14;
const MAX_YEAR_BUMPS = 2;

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const trimmed = isoDate.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (!match) return null;
  return {
    year: Number.parseInt(match[1] ?? "", 10),
    month: Number.parseInt(match[2] ?? "", 10),
    day: Number.parseInt(match[3] ?? "", 10),
  };
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Roll a YYYY-MM-DD forward when it is clearly in the past (e.g. 2025 dates imported in 2026). */
export function correctPastTravelIsoDate(isoDate: string, referenceDate = new Date()): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return isoDate;

  const graceThreshold = referenceDate.getTime() - GRACE_DAYS * 86_400_000;
  let year = parts.year;

  for (let bump = 0; bump <= MAX_YEAR_BUMPS; bump += 1) {
    const candidate = new Date(year, parts.month - 1, parts.day, 12, 0, 0);
    if (candidate.getTime() >= graceThreshold) {
      return formatIsoDate(year, parts.month, parts.day);
    }
    year += 1;
  }

  return isoDate.trim().slice(0, 10);
}

/** Correct YYYY-MM-DD HH:mm (and optional seconds) schedules. */
export function correctPastTravelLocalTime(localTime: string, referenceDate = new Date()): string {
  const trimmed = localTime.trim();
  const datePart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(datePart)) return localTime;
  const correctedDate = correctPastTravelIsoDate(datePart, referenceDate);
  return `${correctedDate}${trimmed.slice(10)}`;
}

export interface TravelDateCorrectable {
  localTime?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  checkOutDate?: string;
}

/** Align all stored schedule fields on a reservation after year correction. */
export function correctReservationTravelDates<T extends TravelDateCorrectable>(
  reservation: T,
  referenceDate = new Date(),
): T {
  const next = { ...reservation };
  const localTime = next.localTime?.trim() ?? "";
  if (localTime) {
    next.localTime = correctPastTravelLocalTime(localTime, referenceDate);
  }

  const localDay = next.localTime?.trim().slice(0, 10) ?? "";
  const correctedLocalDay = /^\d{4}-\d{2}-\d{2}$/u.test(localDay) ? localDay : "";

  if (next.flightDate?.trim()) {
    next.flightDate = correctPastTravelIsoDate(next.flightDate.trim().slice(0, 10), referenceDate);
  } else if (correctedLocalDay) {
    next.flightDate = correctedLocalDay;
  }

  if (next.flightDepartureTime?.trim()) {
    const depDay = next.flightDepartureTime.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/u.test(depDay)) {
      const correctedDepDay = correctPastTravelIsoDate(depDay, referenceDate);
      next.flightDepartureTime = `${correctedDepDay}${next.flightDepartureTime.trim().slice(10)}`;
    }
  } else if (correctedLocalDay && next.localTime?.trim()) {
    next.flightDepartureTime = next.localTime.trim();
  }

  if (next.flightArrivalTime?.trim()) {
    const arrDay = next.flightArrivalTime.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arrDay)) {
      const correctedArrDay = correctPastTravelIsoDate(arrDay, referenceDate);
      next.flightArrivalTime = `${correctedArrDay}${next.flightArrivalTime.trim().slice(10)}`;
    }
  }

  if (next.checkOutDate?.trim()) {
    next.checkOutDate = correctPastTravelIsoDate(next.checkOutDate.trim().slice(0, 10), referenceDate);
  }

  return next;
}
