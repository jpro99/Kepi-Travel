/** Date-only helpers for trip windows and smart email matching. */

export function dateOnly(value: string | undefined | null): string {
  return value?.trim().slice(0, 10) ?? "";
}

export function reservationPrimaryDate(reservation: {
  type?: string;
  localTime?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  checkOutDate?: string;
}): string {
  if (reservation.type === "flight") {
    return (
      dateOnly(reservation.flightDate) ||
      dateOnly(reservation.flightDepartureTime) ||
      dateOnly(reservation.localTime)
    );
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
    const day =
      dateOnly(reservation.flightDate) ||
      dateOnly(reservation.flightDepartureTime) ||
      dateOnly(reservation.localTime);
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
