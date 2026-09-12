/**
 * F16 — Home TODAY must not claim live airborne / landing countdown without
 * a successful live status lookup that reports en-route.
 */

import { formatBookedArrivalDetail } from "@/lib/travelAssistant/bookedFlightArrival";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

export type AirborneLiveStatusInput = {
  flightStatus?: string;
  busy?: boolean;
  error?: string | null;
  checkedAt?: string;
};

const ENROUTE_STATUS_RE =
  /active|enroute|en-route|depart|approach|airborne|in.?flight/iu;

/** True only when a completed live lookup backs an en-route claim. */
export function hasVerifiedLiveAirborneStatus(
  status: AirborneLiveStatusInput | undefined,
): boolean {
  if (!status) return false;
  if (status.busy) return false;
  if (status.error?.trim()) return false;
  if (!status.checkedAt?.trim()) return false;
  const raw = (status.flightStatus ?? "").trim();
  if (!raw) return false;
  return ENROUTE_STATUS_RE.test(raw);
}

export interface AirborneHeroCopy {
  eyebrow: string;
  title: string;
  detail: string | null;
  isLiveClaim: boolean;
}

/**
 * Resolve Home TODAY hero copy for schedule-airborne windows.
 * Keep booked "In the air" + route; live landing countdown only when lookup succeeded en-route.
 */
export function resolveAirborneHeroCopy(
  journeyPhase: Extract<JourneyPhase, { kind: "airborne" }>,
  liveStatus: AirborneLiveStatusInput | undefined,
): AirborneHeroCopy {
  const flight = journeyPhase.onFlight;
  const routeTitle = `${flight.flightDepartureAirport ?? ""} → ${journeyPhase.landingAt}`.trim();
  const bookedArrival = formatBookedArrivalDetail(flight);

  if (liveStatus?.busy) {
    return {
      eyebrow: "In the air",
      title: routeTitle,
      detail: bookedArrival,
      isLiveClaim: false,
    };
  }

  if (hasVerifiedLiveAirborneStatus(liveStatus)) {
    return {
      eyebrow: "In the air",
      title: routeTitle,
      detail: `Landing in ${journeyPhase.landingIn}`,
      isLiveClaim: true,
    };
  }

  return {
    eyebrow: "In the air",
    title: routeTitle,
    detail: bookedArrival,
    isLiveClaim: false,
  };
}
