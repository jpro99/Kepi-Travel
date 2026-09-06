/**
 * Shared flight departure ordering — Flights tab, day sheets, airport navigator.
 * Uses canonical departure time + departure-airport timezone (never raw storage order).
 */

import { timezoneForIata } from "@/lib/airports/lookup";
import {
  canonicalFlightDepartureDay,
  canonicalFlightDepartureLocalTime,
  type CanonicalFlightScheduleFields,
} from "@/lib/travelAssistant/tripWindow";

export interface FlightSortFields extends CanonicalFlightScheduleFields {
  timezone?: string;
  type?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string | null;
  flightArrivalTime?: string;
  plannedOnly?: boolean;
}

/**
 * Departure clock timezone — always prefer departure-airport IATA zone (F15).
 * Stored flight.timezone can bleed to arrival/Europe on multi-leg trips; the
 * departure clock for sorting and leave-by must stay in the origin airport zone.
 */
export function departureTimezoneForFlight(flight: FlightSortFields): string | undefined {
  const depIata = flight.flightDepartureAirport?.trim().toUpperCase();
  const iataTz = depIata ? timezoneForIata(depIata) : undefined;
  if (iataTz) return iataTz;
  const stored = flight.timezone?.trim();
  if (!stored || stored === "Etc/UTC" || stored === "UTC") return undefined;
  return stored;
}

/** Local "YYYY-MM-DD HH:MM" + IANA timezone → UTC ms (Intl offset method). */
export function flightDepartureUtcMs(flight: FlightSortFields): number {
  const local = canonicalFlightDepartureLocalTime(flight)?.trim() || flight.localTime?.trim() || "";
  if (!local) return Number.NaN;
  const s = local.replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return Number.NaN;
  const approxUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const timezone = departureTimezoneForFlight(flight);
  if (!timezone) return approxUtc;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(approxUtc)).map((p) => [p.type, p.value]));
    const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return approxUtc - (asIfUtc - approxUtc);
  } catch {
    return approxUtc;
  }
}

export function compareFlightsByDeparture(a: FlightSortFields, b: FlightSortFields): number {
  const aMs = flightDepartureUtcMs(a);
  const bMs = flightDepartureUtcMs(b);
  if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
  if (Number.isNaN(aMs)) return 1;
  if (Number.isNaN(bMs)) return -1;
  return aMs - bMs;
}

export function sortFlightsByDeparture<T extends FlightSortFields>(flights: readonly T[]): T[] {
  return [...flights].sort(compareFlightsByDeparture);
}

export function isoDayFromMs(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Flights departing on the given calendar day (canonical departure day). */
export function filterFlightsDepartingOnDay<T extends FlightSortFields>(
  flights: readonly T[],
  dateKey: string,
): T[] {
  return sortFlightsByDeparture(
    flights.filter((f) => canonicalFlightDepartureDay(f) === dateKey),
  );
}

export interface TravelDayFlightPick<T extends FlightSortFields> {
  f: T;
  utcMs: number;
}

/**
 * Travel day: earliest flight departing today (Ontario before Seattle on same trip day).
 * Includes flights up to 2h after departure (still at airport / connection).
 */
export function selectTravelDayDepartureFlight<T extends FlightSortFields>(
  flights: readonly T[],
  nowMs: number,
): TravelDayFlightPick<T> | null {
  const todayKey = isoDayFromMs(nowMs);
  const todayFlights = filterFlightsDepartingOnDay(
    flights.filter((f) => (f.type ?? "flight").toLowerCase() === "flight"),
    todayKey,
  );
  if (todayFlights.length === 0) return null;

  const graceMs = 2 * 60 * 60_000;
  const timed = todayFlights
    .map((f) => ({ f, utcMs: flightDepartureUtcMs(f) }))
    .filter((row) => Number.isFinite(row.utcMs));

  const upcoming = timed.filter((row) => row.utcMs > nowMs - graceMs);
  const pick = upcoming[0] ?? timed[0];
  return pick ?? null;
}

export function formatTravelDayFlightLabel(f: {
  flightNumber?: string | null;
  flightDepartureAirport?: string | null;
  flightArrivalAirport?: string | null;
}): string {
  const route = [f.flightDepartureAirport, f.flightArrivalAirport].filter(Boolean).join(" → ");
  const fn = f.flightNumber?.trim();
  if (fn && route) return `${fn} · ${route}`;
  return fn || route || "Your flight today";
}

const NEXT_REMAINING_BEHIND_GRACE_MS = 2 * 60 * 60_000;

/**
 * Next remaining flight = earliest booked segment whose departure is still ahead
 * in clock time (timezone-aware). Storage order and long-haul role are ignored (F15).
 */
export function selectNextRemainingFlight<T extends FlightSortFields>(
  reservations: readonly T[],
  nowMs: number = Date.now(),
): T | null {
  const flights = sortFlightsByDeparture(
    reservations.filter(
      (r) => (r.type ?? "flight").toLowerCase() === "flight" && r.plannedOnly !== true,
    ),
  );
  const timed = flights
    .map((f) => ({ f, utcMs: flightDepartureUtcMs(f) }))
    .filter((row) => Number.isFinite(row.utcMs));
  const upcoming = timed.find((row) => row.utcMs >= nowMs - NEXT_REMAINING_BEHIND_GRACE_MS);
  if (upcoming) return upcoming.f;
  // G49 — mid-trip Home must not replay Day 1 when every leg has departed.
  const future = timed.find((row) => row.utcMs > nowMs);
  return future?.f ?? null;
}
