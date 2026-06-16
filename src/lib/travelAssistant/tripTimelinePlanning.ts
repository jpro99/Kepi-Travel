export interface TimelinePlanReservation {
  id: string;
  type: string;
  localTime: string;
  timezone?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  checkOutDate?: string;
}

function parseLocalMs(localTime: string): number {
  if (!localTime) return Number.NaN;
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return Number.NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)).getTime();
}

function dateKeyFromLocal(localTime: string): string {
  return localTime.trim().slice(0, 10);
}

function flightDateKey(r: TimelinePlanReservation): string {
  if (r.flightDate) return r.flightDate.slice(0, 10);
  const dep = r.flightDepartureTime ? parseLocalMs(r.flightDepartureTime) : parseLocalMs(r.localTime);
  if (!Number.isNaN(dep)) return new Date(dep).toISOString().slice(0, 10);
  return dateKeyFromLocal(r.localTime);
}

function reservationEndMs(r: TimelinePlanReservation): number {
  if (r.type === "hotel") {
    const checkout = r.checkOutDate?.trim().slice(0, 10);
    if (checkout) return Date.parse(`${checkout}T23:59:00`);
    const checkIn = parseLocalMs(r.localTime);
    return Number.isNaN(checkIn) ? Number.NaN : checkIn + 24 * 60 * 60_000;
  }
  if (r.type === "flight") {
    const arr = r.flightArrivalTime ? parseLocalMs(r.flightArrivalTime) : Number.NaN;
    if (!Number.isNaN(arr)) return arr;
    const dep = r.flightDepartureTime ? parseLocalMs(r.flightDepartureTime) : parseLocalMs(r.localTime);
    return Number.isNaN(dep) ? Number.NaN : dep + 6 * 60 * 60_000;
  }
  const local = parseLocalMs(r.localTime);
  return Number.isNaN(local) ? Number.NaN : local + 2 * 60 * 60_000;
}

export function reservationIsPast(r: TimelinePlanReservation, nowMs: number = Date.now()): boolean {
  const endMs = reservationEndMs(r);
  if (!Number.isNaN(endMs)) return nowMs > endMs + 2 * 60 * 60_000;
  const key = r.type === "flight" ? flightDateKey(r) : dateKeyFromLocal(r.localTime);
  if (!key) return false;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return key < today;
}

export function splitPastAndUpcomingReservations<T extends TimelinePlanReservation>(
  reservations: T[],
  nowMs: number = Date.now(),
): { upcoming: T[]; past: T[] } {
  const past: T[] = [];
  const upcoming: T[] = [];
  for (const r of reservations) {
    (reservationIsPast(r, nowMs) ? past : upcoming).push(r);
  }
  return { upcoming, past };
}

function hotelDayKeys(r: TimelinePlanReservation): string[] {
  const checkIn = dateKeyFromLocal(r.localTime);
  if (!checkIn) return [];
  const checkout = r.checkOutDate?.trim().slice(0, 10);
  if (!checkout || checkout <= checkIn) return [checkIn];
  const keys: string[] = [];
  const cursor = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkout}T12:00:00`).getTime();
  while (cursor.getTime() <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function reservationDayKeys(r: TimelinePlanReservation): string[] {
  if (r.type === "hotel") return hotelDayKeys(r);
  if (r.type === "flight") return [flightDateKey(r)].filter(Boolean);
  const key = dateKeyFromLocal(r.localTime);
  return key ? [key] : [];
}

/** Only days that actually have plans — no empty “free day” filler. */
export function buildCompactTimelineDayKeys(
  reservations: TimelinePlanReservation[],
  tripStartDate?: string | null,
  tripEndDate?: string | null,
): string[] {
  const keys = new Set<string>();
  for (const r of reservations) {
    for (const key of reservationDayKeys(r)) keys.add(key);
  }
  const tripStart = tripStartDate?.slice(0, 10);
  const tripEnd = tripEndDate?.slice(0, 10);
  if (tripStart) keys.add(tripStart);
  if (tripEnd) keys.add(tripEnd);

  let sorted = [...keys].sort();
  if (tripStart && tripEnd) {
    sorted = sorted.filter((key) => key >= tripStart && key <= tripEnd);
  }
  return sorted;
}

export function deriveTripDateRangeFromReservations(
  reservations: TimelinePlanReservation[],
): { startDate: string | null; endDate: string | null } {
  const keys = new Set<string>();
  for (const r of reservations) {
    for (const key of reservationDayKeys(r)) keys.add(key);
  }
  const sorted = [...keys].sort();
  if (sorted.length === 0) return { startDate: null, endDate: null };
  return { startDate: sorted[0], endDate: sorted[sorted.length - 1] };
}

export function hotelNeedsTripDateConfirmation(
  hotel: TimelinePlanReservation,
  tripStartDate?: string | null,
  tripEndDate?: string | null,
): boolean {
  const checkIn = dateKeyFromLocal(hotel.localTime);
  if (!checkIn) return true;
  const checkout = hotel.checkOutDate?.trim().slice(0, 10) ?? checkIn;
  if (!tripStartDate || !tripEndDate) return true;
  const start = tripStartDate.slice(0, 10);
  const end = tripEndDate.slice(0, 10);
  return checkIn < start || checkIn > end || checkout > end;
}
