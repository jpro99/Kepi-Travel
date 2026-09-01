/**
 * Coarse airport location phase — time + GPS geofence (not indoor positioning).
 * Shared by AirportMode hero and Day Coach spotlight (G46).
 */

import type { UserAirportStatus } from "@/lib/travelAssistant/airportGeo";

export type AirportLocationPhase =
  | "off"
  | "leave-soon"
  | "leave-now"
  | "check-in"
  | "security"
  | "lounge"
  | "head-to-gate"
  | "at-gate"
  | "final-call"
  | "departed";

export function resolveAirportLocationPhase(input: {
  departureUtcMs: number;
  nowMs: number;
  locationStatus: UserAirportStatus | string;
  hasLoungeAccess?: boolean;
}): AirportLocationPhase {
  const min = (input.departureUtcMs - input.nowMs) / 60_000;
  const status = input.locationStatus;
  const hasLounge = input.hasLoungeAccess ?? false;

  if (min < 0) return min > -60 ? "departed" : "off";

  // Physically on campus — never hide as "off" for international early arrival (>3h).
  if (status === "in-terminal") {
    if (min < 20) return "final-call";
    if (min > 60 && hasLounge) return "lounge";
    if (min > 30) return "head-to-gate";
    return "at-gate";
  }

  if (status === "at-airport") {
    if (min < 20) return "final-call";
    if (min < 45) return "security";
    return "check-in";
  }

  // Away from the airport — only surface coach inside ~3h of departure.
  if (min > 180) return "off";
  if (min < 20) return "final-call";
  if (min < 90) return "leave-now";
  return "leave-soon";
}

/** Home / TripWalk copy for depart phases before spotlight step text. */
export function departPhaseHomeTitle(phase: AirportLocationPhase): string | null {
  switch (phase) {
    case "leave-now":
      return "Leave for the airport";
    case "leave-soon":
      return "Plan to leave for the airport";
    case "final-call":
      return "Final boarding call";
    default:
      return null;
  }
}
