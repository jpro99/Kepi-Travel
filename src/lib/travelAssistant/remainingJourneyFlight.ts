/**
 * Remaining-journey flight selection — extends F15 remaining-pick with an
 * active arrival leg (e.g. FCO first-mile after SEA→FCO). Storage order and
 * long-haul role never override the clock or the arrive window.
 */

import {
  flightDepartureUtcMs,
  selectNextRemainingFlight,
  type FlightSortFields,
} from "@/lib/travelAssistant/flightSort";
import { timezoneForIata } from "@/lib/airports/lookup";

const MS_PER_MIN = 60_000;
/** Match journeyPhase POST_ARRIVAL_ACTIVE_MS — stay on arrive coach after landing. */
export const REMAINING_ARRIVAL_ACTIVE_MS = 6 * 60 * MS_PER_MIN;

function toUtcMs(localTime: string, timezone?: string): number {
  const normalized = localTime.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(normalized);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const tz = timezone?.trim();
  if (!tz) return approxUtcMs;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(approxUtcMs)).map((p) => [p.type, p.value]));
    const tzAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    return approxUtcMs - (tzAsUtcMs - approxUtcMs);
  } catch {
    return approxUtcMs;
  }
}

function flightArrivalUtcMs(f: FlightSortFields & { flightArrivalAirport?: string | null }): number {
  const depMs = flightDepartureUtcMs(f);
  if (f.flightArrivalTime?.trim()) {
    const arrivalTz = timezoneForIata(f.flightArrivalAirport ?? "") ?? f.timezone;
    const ms = toUtcMs(f.flightArrivalTime, arrivalTz);
    if (!Number.isNaN(ms) && (Number.isNaN(depMs) || ms > depMs)) return ms;
  }
  if (!Number.isNaN(depMs)) return depMs + 4 * 60 * MS_PER_MIN;
  return Number.NaN;
}

function isBookedFlight<T extends FlightSortFields>(r: T): boolean {
  return (r.type ?? "flight").toLowerCase() === "flight" && r.plannedOnly !== true;
}

/**
 * Active arrival leg within the post-landing window — drives FCO arrive coach
 * even when a later outbound (e.g. FCO→BRI) is stored on the trip.
 */
export function selectActiveArrivalFlight<T extends FlightSortFields>(
  reservations: readonly T[],
  nowMs: number = Date.now(),
): T | null {
  const flights = reservations.filter(isBookedFlight);
  let best: { f: T; arrMs: number } | null = null;
  for (const f of flights) {
    const depMs = flightDepartureUtcMs(f);
    const arrMs = flightArrivalUtcMs(f);
    if (Number.isNaN(arrMs) || nowMs < depMs) continue;
    if (nowMs < arrMs || nowMs >= arrMs + REMAINING_ARRIVAL_ACTIVE_MS) continue;
    if (!best || arrMs > best.arrMs) best = { f, arrMs };
  }
  return best?.f ?? null;
}

/**
 * Remaining journey = active arrival leg when in the arrive window, else F15
 * selectNextRemainingFlight (ONT → SEA → FCO departures).
 */
export function selectRemainingJourneyFlight<T extends FlightSortFields>(
  reservations: readonly T[],
  nowMs: number = Date.now(),
): T | null {
  const arrival = selectActiveArrivalFlight(reservations, nowMs);
  if (arrival) return arrival;
  return selectNextRemainingFlight(reservations, nowMs);
}

export function isFcoArriveRemainingJourney<T extends FlightSortFields>(
  flight: T | null | undefined,
): boolean {
  if (!flight) return false;
  return flight.flightArrivalAirport?.trim().toUpperCase() === "FCO";
}

export function normalizeFlightNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, "").toUpperCase();
}

export function remainingFlightDateKey(f: FlightSortFields): string {
  return (
    f.flightDepartureTime?.trim().slice(0, 10) ??
    f.flightDate?.trim().slice(0, 10) ??
    f.localTime?.trim().slice(0, 10) ??
    ""
  );
}

/** True when this lookup matches the traveler's booked remaining flight. */
export function isBookedRemainingFlightLookup<T extends FlightSortFields>(
  reservations: readonly T[],
  flightNumber: string,
  flightDate: string,
  nowMs: number = Date.now(),
): boolean {
  const remaining = selectRemainingJourneyFlight(reservations, nowMs);
  if (!remaining) return false;
  if (normalizeFlightNumber(remaining.flightNumber) !== normalizeFlightNumber(flightNumber)) {
    return false;
  }
  const remDate = remainingFlightDateKey(remaining);
  return remDate.length > 0 && remDate === flightDate.trim().slice(0, 10);
}
