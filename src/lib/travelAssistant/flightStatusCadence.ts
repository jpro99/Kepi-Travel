/**
 * Phase-aware flight status polling cadence.
 * Within 6h of departure we poll aggressively; farther out we conserve API credits.
 * At the airport we poll every 4 minutes — fast enough for gate changes without
 * starving the UI (sub-second polling was freezing the app on airport Wi‑Fi).
 */

export const FLIGHT_STATUS_POLL_OUTSIDE_HOURS = 24;
export const FLIGHT_STATUS_POLL_CRITICAL_HOURS = 6;
export const FLIGHT_STATUS_POLL_INTERVAL_FAR_MS = 5 * 60_000;
export const FLIGHT_STATUS_POLL_INTERVAL_NEAR_MS = 90_000;
/** At airport campus — gate board refresh; keep light for perf (F9). */
export const FLIGHT_STATUS_POLL_INTERVAL_AT_AIRPORT_MS = 4 * 60_000;
/** Inside the terminal — same cadence as campus (F9). */
export const FLIGHT_STATUS_POLL_INTERVAL_IN_TERMINAL_MS = 4 * 60_000;
export const FLIGHT_STATUS_SERVER_SWEEP_INTERVAL_MINUTES = 2;

export type FlightStatusPollProximity =
  | "away"
  | "at-airport"
  | "in-terminal"
  | "airborne"
  | "unknown";

export function hoursUntilDeparture(departureUtcMs: number, nowMs = Date.now()): number {
  return (departureUtcMs - nowMs) / 3_600_000;
}

export function shouldPollFlightStatus(departureUtcMs: number, nowMs = Date.now()): boolean {
  const hours = hoursUntilDeparture(departureUtcMs, nowMs);
  return hours > -1 && hours < FLIGHT_STATUS_POLL_OUTSIDE_HOURS;
}

export function resolveFlightStatusPollIntervalMs(
  nearestDepartureUtcMs: number | null,
  nowMs = Date.now(),
  proximity: FlightStatusPollProximity = "away",
): number {
  if (nearestDepartureUtcMs === null || !Number.isFinite(nearestDepartureUtcMs)) {
    return FLIGHT_STATUS_POLL_INTERVAL_FAR_MS;
  }
  if (!shouldPollFlightStatus(nearestDepartureUtcMs, nowMs)) {
    return FLIGHT_STATUS_POLL_INTERVAL_FAR_MS;
  }
  if (proximity === "in-terminal") {
    return FLIGHT_STATUS_POLL_INTERVAL_IN_TERMINAL_MS;
  }
  if (proximity === "at-airport") {
    return FLIGHT_STATUS_POLL_INTERVAL_AT_AIRPORT_MS;
  }
  const hours = hoursUntilDeparture(nearestDepartureUtcMs, nowMs);
  if (hours <= FLIGHT_STATUS_POLL_CRITICAL_HOURS) {
    return FLIGHT_STATUS_POLL_INTERVAL_NEAR_MS;
  }
  return FLIGHT_STATUS_POLL_INTERVAL_FAR_MS;
}

export function isFlightStatusStale(
  checkedAtIso: string | undefined | null,
  departureUtcMs: number,
  nowMs = Date.now(),
  proximity: FlightStatusPollProximity = "away",
): boolean {
  if (!checkedAtIso) return true;
  const checkedAtMs = Date.parse(checkedAtIso);
  if (Number.isNaN(checkedAtMs)) return true;
  const intervalMs = resolveFlightStatusPollIntervalMs(departureUtcMs, nowMs, proximity);
  return nowMs - checkedAtMs >= intervalMs;
}

export function nearestUpcomingFlightDepartureUtcMs(
  flights: ReadonlyArray<{ localTime?: string; flightDepartureTime?: string }>,
  nowMs = Date.now(),
): number | null {
  let nearest: number | null = null;
  for (const flight of flights) {
    const local = (flight.flightDepartureTime ?? flight.localTime ?? "").trim();
    if (!local) continue;
    const depMs = Date.parse(local.replace("T", " ").slice(0, 16));
    if (Number.isNaN(depMs)) continue;
    if (!shouldPollFlightStatus(depMs, nowMs)) continue;
    if (nearest === null || depMs < nearest) {
      nearest = depMs;
    }
  }
  return nearest;
}

type PollableFlight = {
  type?: string;
  id?: string;
  localTime?: string;
  flightDepartureTime?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
};

/** Poll one flight — at the physical airport first, else chronologically next. */
export function resolveFlightForStatusPoll<T extends PollableFlight>(
  flights: ReadonlyArray<T>,
  userLat: number | null,
  userLon: number | null,
  nowMs = Date.now(),
  resolvePhysicalIata: (lat: number | null, lon: number | null) => string | null,
): T | null {
  const upcoming = flights.filter((r) => {
    if ((r.type ?? "flight") !== "flight") return false;
    const local = (r.flightDepartureTime ?? r.localTime ?? "").trim();
    if (!local) return false;
    const depMs = Date.parse(local.replace("T", " ").slice(0, 16));
    if (Number.isNaN(depMs)) return false;
    return shouldPollFlightStatus(depMs, nowMs);
  });
  if (!upcoming.length) return null;

  const physical = resolvePhysicalIata(userLat, userLon);
  if (physical) {
    const atField =
      upcoming.find(
        (f) =>
          f.flightDepartureAirport?.trim().toUpperCase() === physical ||
          f.flightArrivalAirport?.trim().toUpperCase() === physical,
      ) ?? null;
    if (atField) return atField;
  }

  const nearestDep = nearestUpcomingFlightDepartureUtcMs(upcoming, nowMs);
  if (nearestDep === null) return upcoming[0] ?? null;
  return (
    upcoming.find((r) => {
      const local = (r.flightDepartureTime ?? r.localTime ?? "").trim();
      const depMs = Date.parse(local.replace("T", " ").slice(0, 16));
      return depMs === nearestDep;
    }) ?? upcoming[0] ?? null
  );
}
