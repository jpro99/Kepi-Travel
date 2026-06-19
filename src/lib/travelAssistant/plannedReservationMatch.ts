import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";

export interface PlannedMatchableReservation {
  id?: string;
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  localTime?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  checkOutDate?: string;
  bookUrl?: string;
  quotedPriceUsd?: number;
  notes?: string;
  source?: string;
}

export function isPlannedReservation(reservation: PlannedMatchableReservation): boolean {
  if (reservation.plannedOnly === true) return true;
  const code = reservation.confirmationCode?.trim().toUpperCase() ?? "";
  return code === "PLANNED";
}

export function parseAirportsFromLocation(location: string): { dep?: string; arr?: string } {
  const match = location.match(/\b([A-Z]{3})\s*→\s*([A-Z]{3})\b/);
  if (!match) return {};
  return { dep: match[1], arr: match[2] };
}

export function reservationFlightDate(reservation: PlannedMatchableReservation): string {
  if (reservation.flightDate?.trim()) return reservation.flightDate.trim().slice(0, 10);
  if (reservation.flightDepartureTime?.trim()) return reservation.flightDepartureTime.trim().slice(0, 10);
  if (reservation.localTime?.trim()) return reservation.localTime.trim().slice(0, 10);
  return "";
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesOverlap(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function isPlaceholderScheduleTime(localTime: string | undefined): boolean {
  if (!localTime?.trim()) return true;
  return /T(09|12|15):00:00?$/.test(localTime.trim());
}

export function extractBookUrlFromNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  const match = notes.match(/Purchase:\s*(https?:\/\/\S+)/i);
  return match?.[1];
}

export function matchesPlannedFlight(
  existing: PlannedMatchableReservation,
  incoming: PlannedMatchableReservation,
): boolean {
  if (!isPlannedReservation(existing) || existing.type !== "flight" || incoming.type !== "flight") {
    return false;
  }

  const existingRoute = parseAirportsFromLocation(existing.location ?? "");
  const incomingRoute = parseAirportsFromLocation(incoming.location ?? "");
  const existingDep = (existing.flightDepartureAirport ?? existingRoute.dep ?? "").trim().toUpperCase();
  const existingArr = (existing.flightArrivalAirport ?? existingRoute.arr ?? "").trim().toUpperCase();
  const incomingDep = (incoming.flightDepartureAirport ?? incomingRoute.dep ?? "").trim().toUpperCase();
  const incomingArr = (incoming.flightArrivalAirport ?? incomingRoute.arr ?? "").trim().toUpperCase();

  if (!existingDep || !existingArr || !incomingDep || !incomingArr) return false;
  if (existingDep !== incomingDep || existingArr !== incomingArr) return false;

  const existingDate = reservationFlightDate(existing);
  const incomingDate = reservationFlightDate(incoming);
  if (existingDate && incomingDate && existingDate !== incomingDate) return false;

  return true;
}

export function matchesPlannedHotel(
  existing: PlannedMatchableReservation,
  incoming: PlannedMatchableReservation,
): boolean {
  if (!isPlannedReservation(existing) || existing.type !== "hotel" || incoming.type !== "hotel") {
    return false;
  }

  const existingDate = (existing.localTime ?? "").trim().slice(0, 10);
  const incomingDate = (incoming.localTime ?? "").trim().slice(0, 10);
  if (existingDate.length === 10 && incomingDate.length === 10 && existingDate !== incomingDate) {
    return false;
  }

  const existingName = `${existing.provider ?? ""} ${existing.title ?? ""} ${existing.location ?? ""}`.trim();
  const incomingName = `${incoming.provider ?? ""} ${incoming.title ?? ""} ${incoming.location ?? ""}`.trim();
  return namesOverlap(existingName, incomingName);
}

export function findPlannedReplacementIndex<T extends PlannedMatchableReservation>(
  reservations: T[],
  incoming: PlannedMatchableReservation,
): number {
  return reservations.findIndex((reservation) => {
    if (incoming.type === "flight") return matchesPlannedFlight(reservation, incoming);
    if (incoming.type === "hotel") return matchesPlannedHotel(reservation, incoming);
    return false;
  });
}

export function mergeIncomingOverPlanned<T extends PlannedMatchableReservation>(
  planned: T,
  incoming: T,
): T {
  return {
    ...planned,
    ...incoming,
    id: planned.id,
    plannedOnly: false,
    bookUrl: planned.bookUrl ?? incoming.bookUrl ?? extractBookUrlFromNotes(planned.notes),
    quotedPriceUsd: incoming.quotedPriceUsd ?? planned.quotedPriceUsd,
    confirmationCode:
      incoming.confirmationCode?.trim() && !isPlaceholderConfirmation(incoming.confirmationCode)
        ? incoming.confirmationCode
        : planned.confirmationCode,
    source: (incoming.source as T["source"]) ?? planned.source,
  };
}

export function upsertReservationReplacingPlanned<T extends PlannedMatchableReservation & { id: string }>(
  reservations: T[],
  incoming: T,
): { reservations: T[]; replaced: boolean; replacedId?: string } {
  const index = findPlannedReplacementIndex(reservations, incoming);
  if (index < 0) {
    return { reservations: [incoming, ...reservations], replaced: false };
  }
  const merged = mergeIncomingOverPlanned(reservations[index], incoming) as T;
  const next = [...reservations];
  next[index] = merged;
  return { reservations: next, replaced: true, replacedId: reservations[index].id };
}

export function countBookingProgress(
  reservations: PlannedMatchableReservation[],
): { confirmed: number; planned: number; total: number } {
  const bookable = reservations.filter((r) => r.type === "flight" || r.type === "hotel");
  const planned = bookable.filter((r) => isPlannedReservation(r)).length;
  return {
    confirmed: bookable.length - planned,
    planned,
    total: bookable.length,
  };
}
