/**
 * Identity + dedupe rules for flight legs imported from forwarded emails.
 * Keeps one reservation per physical leg (flight number + route + departure day).
 */

import { shouldReplaceStoredSourceText } from "@/lib/travelAssistant/emailSourceText";

export interface FlightLegMatchFields {
  type?: string;
  localTime?: string;
  location?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
  originalEmailText?: string;
  sourceEmailId?: string;
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/gu, "");
}

export function normalizeFlightNumber(value: string | undefined): string {
  return normalizeToken(value).replace(/[^A-Z0-9]/gu, "");
}

function departureAirport(fields: FlightLegMatchFields): string {
  return normalizeToken(fields.flightDepartureAirport ?? fields.departureAirport).slice(0, 3);
}

function arrivalAirport(fields: FlightLegMatchFields): string {
  return normalizeToken(fields.flightArrivalAirport ?? fields.arrivalAirport).slice(0, 3);
}

function departureDay(fields: FlightLegMatchFields): string {
  return normalizeToken(fields.localTime).slice(0, 10);
}

/** Stable key for one flight leg within a trip. */
export function flightLegIdentityKey(fields: FlightLegMatchFields): string {
  const flightNumber = normalizeFlightNumber(fields.flightNumber);
  const dep = departureAirport(fields);
  const arr = arrivalAirport(fields);
  const day = departureDay(fields);
  if (flightNumber) {
    return `fn:${flightNumber}|${dep}|${arr}|${day}`;
  }
  return `route:${dep}|${arr}|${day}`;
}

/** True when incoming leg is the same physical flight as an existing reservation. */
export function isSameFlightLeg(existing: FlightLegMatchFields, incoming: FlightLegMatchFields): boolean {
  const existingType = normalizeToken(existing.type);
  const incomingType = normalizeToken(incoming.type);
  if (existingType !== "FLIGHT" || incomingType !== "FLIGHT") {
    return false;
  }

  const existingFlight = normalizeFlightNumber(existing.flightNumber);
  const incomingFlight = normalizeFlightNumber(incoming.flightNumber);
  const existingDep = departureAirport(existing);
  const incomingDep = departureAirport(incoming);
  const existingArr = arrivalAirport(existing);
  const incomingArr = arrivalAirport(incoming);
  const existingDay = departureDay(existing);
  const incomingDay = departureDay(incoming);

  if (existingFlight && incomingFlight && existingFlight === incomingFlight) {
    if (existingDep && incomingDep && existingDep !== incomingDep) return false;
    if (existingArr && incomingArr && existingArr !== incomingArr) return false;
    if (existingDay && incomingDay && existingDay !== incomingDay) return false;
    return true;
  }

  if (
    existingDep &&
    incomingDep &&
    existingArr &&
    incomingArr &&
    existingDep === incomingDep &&
    existingArr === incomingArr
  ) {
    if (existingDay && incomingDay) {
      return existingDay === incomingDay;
    }
    return normalizeToken(existing.localTime) === normalizeToken(incoming.localTime);
  }

  const existingCode = normalizeToken(existing.confirmationCode);
  const incomingCode = normalizeToken(incoming.confirmationCode);
  if (existingCode && incomingCode && existingCode === incomingCode) {
    if (existingFlight && incomingFlight) {
      return existingFlight === incomingFlight;
    }
    if (existingDep && incomingDep && existingArr && incomingArr) {
      return existingDep === incomingDep && existingArr === incomingArr;
    }
  }

  return false;
}

function flightLegRichness(fields: FlightLegMatchFields): number {
  let score = 0;
  if (normalizeFlightNumber(fields.flightNumber)) score += 4;
  if (departureAirport(fields)) score += 2;
  if (arrivalAirport(fields)) score += 2;
  const time = normalizeToken(fields.localTime);
  if (time.length >= 16) score += 3;
  else if (time.length >= 10) score += 1;
  if (normalizeToken(fields.confirmationCode)) score += 1;
  return score;
}

function isEmptyPricingValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/** Collapsing duplicates must never drop a fare the other copy carried (G39). */
function carryPricingForward<T extends FlightLegMatchFields>(winner: T, loser: T): T {
  const next = { ...winner };
  let changed = false;
  for (const key of [
    "quotedPriceUsd",
    "quotedPointsMiles",
    "quotedMilesEarned",
    "pointsProgram",
    "sourceEmailId",
  ] as const) {
    if (isEmptyPricingValue(next[key]) && !isEmptyPricingValue(loser[key])) {
      Object.assign(next, { [key]: loser[key] });
      changed = true;
    }
  }
  const winnerText = winner.originalEmailText?.trim() ?? "";
  const loserText = loser.originalEmailText?.trim() ?? "";
  if (loserText && shouldReplaceStoredSourceText(winnerText, loserText)) {
    next.originalEmailText = loserText;
    changed = true;
  }
  return changed ? next : winner;
}

/** Collapse duplicate flight reservations after import — keeps the richest leg. */
export function dedupeFlightReservations<T extends FlightLegMatchFields>(reservations: T[]): T[] {
  const kept: T[] = [];
  for (const reservation of reservations) {
    if (normalizeToken(reservation.type) !== "FLIGHT") {
      kept.push(reservation);
      continue;
    }
    const matchIndex = kept.findIndex((existing) => isSameFlightLeg(existing, reservation));
    if (matchIndex < 0) {
      kept.push(reservation);
      continue;
    }
    const existing = kept[matchIndex]!;
    const winner =
      flightLegRichness(reservation) > flightLegRichness(existing) ? reservation : existing;
    const loser = winner === existing ? reservation : existing;
    kept[matchIndex] = carryPricingForward(winner, loser);
  }
  return kept;
}

export function findMatchingFlightReservationIndex<T extends FlightLegMatchFields>(
  reservations: T[],
  incoming: FlightLegMatchFields,
): number {
  return reservations.findIndex((reservation) => isSameFlightLeg(reservation, incoming));
}
