/**
 * Single source of truth for in-flight detection.
 * Prevents stale "you're still on the plane" guidance after landing.
 */

import { toUtcMs } from "./journeyPhase";

export interface FlightTimingFields {
  id?: string;
  type?: string;
  localTime?: string;
  timezone?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightStatus?: string;
}

const MS_PER_MIN = 60_000;

/** Without a stored arrival time, never assume airborne longer than this. */
export const MAX_AIRBORNE_WITHOUT_ARRIVAL_MS = 5 * 60 * MS_PER_MIN;

/** Brief grace after scheduled arrival before treating the traveler as on the ground. */
export const POST_ARRIVAL_AIRBORNE_GRACE_MS = 20 * MS_PER_MIN;

export type TravelerLocationStatus =
  | "away"
  | "at-airport"
  | "in-terminal"
  | "airborne"
  | "unknown";

export function isFlightTerminalStatus(status?: string | null): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("landed") ||
    normalized.includes("arrived") ||
    normalized.includes("cancel") ||
    normalized.includes("divert") ||
    normalized.includes("completed") ||
    normalized === "inactive"
  );
}

export function flightDepartureUtcMs(flight: FlightTimingFields): number {
  const candidates = [
    flight.flightDepartureTime,
    flight.localTime,
    flight.flightDate ? `${flight.flightDate} 12:00` : "",
  ];
  for (const value of candidates) {
    if (!value?.trim()) continue;
    const ms = toUtcMs(value, flight.timezone);
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.NaN;
}

export function flightArrivalUtcMs(flight: FlightTimingFields): number {
  if (flight.flightArrivalTime?.trim()) {
    const ms = toUtcMs(flight.flightArrivalTime, flight.timezone);
    if (!Number.isNaN(ms)) return ms;
  }
  const depMs = flightDepartureUtcMs(flight);
  if (!Number.isNaN(depMs)) return depMs + 4 * 60 * MS_PER_MIN;
  return Number.NaN;
}

export function isFlightAirborneAt(
  flight: FlightTimingFields,
  nowMs: number,
  options?: { liveFlightStatus?: string | null },
): boolean {
  if (flight.type && flight.type !== "flight") return false;
  if (
    isFlightTerminalStatus(flight.flightStatus) ||
    isFlightTerminalStatus(options?.liveFlightStatus)
  ) {
    return false;
  }

  const depMs = flightDepartureUtcMs(flight);
  if (Number.isNaN(depMs) || nowMs < depMs) return false;

  // Never assume still airborne more than 5h after wheels-up — catches mangled future arrival times.
  if (nowMs - depMs >= MAX_AIRBORNE_WITHOUT_ARRIVAL_MS) return false;

  const arrMs = flightArrivalUtcMs(flight);
  const hasStoredArrival = Boolean(flight.flightArrivalTime?.trim());
  if (!Number.isNaN(arrMs)) {
    if (nowMs >= arrMs + POST_ARRIVAL_AIRBORNE_GRACE_MS) return false;
    if (hasStoredArrival) {
      return nowMs < arrMs + POST_ARRIVAL_AIRBORNE_GRACE_MS;
    }
    // Estimated arrival (dep + 4h) — in-air only until that estimate, not through grace.
    return nowMs < arrMs;
  }

  return nowMs - depMs < MAX_AIRBORNE_WITHOUT_ARRIVAL_MS;
}

export function findAirborneFlight<T extends FlightTimingFields>(
  flights: T[],
  nowMs: number = Date.now(),
  liveStatusById?: Record<string, { flightStatus?: string } | undefined>,
): T | null {
  for (const flight of flights) {
    const live = flight.id ? liveStatusById?.[flight.id] : undefined;
    if (isFlightAirborneAt(flight, nowMs, { liveFlightStatus: live?.flightStatus })) {
      return flight;
    }
  }
  return null;
}

interface ProximityResult {
  status: "away" | "at-airport" | "in-terminal" | "unknown";
  distanceKm: number | null;
}

/** If GPS shows the traveler on the ground far from any airport, never report airborne. */
const GPS_GROUND_OVERRIDE_KM = 3;

export function resolveTravelerLocationStatus(args: {
  flights: FlightTimingFields[];
  nowMs?: number;
  userLat?: number | null;
  userLon?: number | null;
  departureIata?: string;
  liveStatusById?: Record<string, { flightStatus?: string } | undefined>;
  getProximity?: (
    lat: number | null,
    lon: number | null,
    iata?: string,
  ) => ProximityResult;
}): TravelerLocationStatus {
  const nowMs = args.nowMs ?? Date.now();
  const airborne = findAirborneFlight(args.flights, nowMs, args.liveStatusById);

  if (airborne) {
    if (args.getProximity && args.userLat != null && args.userLon != null) {
      const prox = args.getProximity(args.userLat, args.userLon, args.departureIata);
      if (prox.status === "away" && (prox.distanceKm ?? Infinity) > GPS_GROUND_OVERRIDE_KM) {
        return "away";
      }
    }
    return "airborne";
  }

  if (args.getProximity && args.userLat != null && args.userLon != null) {
    const prox = args.getProximity(args.userLat, args.userLon, args.departureIata);
    if (prox.status !== "unknown") return prox.status;
  }

  return "unknown";
}
