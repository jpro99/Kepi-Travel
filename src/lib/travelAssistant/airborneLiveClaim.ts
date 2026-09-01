/**
 * F16 — Home TODAY must not claim live airborne / landing countdown without
 * a successful live status lookup that reports en-route.
 */

import type { JourneyPhase, JourneyReservation } from "@/lib/travelAssistant/journeyPhase";
import { formatFlightStatusTrustLine } from "@/lib/travelAssistant/flightStatusTrustLine";
import { formatTravelDayFlightLabel } from "@/lib/travelAssistant/flightSort";

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

function formatBookedArrivalDetail(flight: JourneyReservation): string | null {
  const arr = flight.flightArrivalTime?.trim();
  if (!arr) return null;
  const timePart = arr.includes(" ") ? arr.split(/\s+/u).pop() : arr;
  return timePart ? `Scheduled arrival ${timePart}` : null;
}

/**
 * Resolve Home TODAY hero copy for schedule-airborne windows.
 * Live "In the air / Landing in Xm" only when lookup succeeded with en-route status.
 */
export function resolveAirborneHeroCopy(
  journeyPhase: Extract<JourneyPhase, { kind: "airborne" }>,
  liveStatus: AirborneLiveStatusInput | undefined,
  now: Date = new Date(),
): AirborneHeroCopy {
  const flight = journeyPhase.onFlight;
  const routeTitle = `${flight.flightDepartureAirport ?? ""} → ${journeyPhase.landingAt}`.trim();
  const bookedTitle = formatTravelDayFlightLabel(flight) || routeTitle || "Your flight today";

  if (liveStatus?.busy) {
    return {
      eyebrow: "Today",
      title: bookedTitle,
      detail: "Checking live status…",
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

  const trustLine = formatFlightStatusTrustLine(liveStatus, now);
  const bookedArrival = formatBookedArrivalDetail(flight);
  const detail =
    liveStatus?.error?.trim() ||
    (trustLine && !/not checked yet/i.test(trustLine) ? trustLine : null) ||
    bookedArrival;

  return {
    eyebrow: "Today",
    title: bookedTitle,
    detail,
    isLiveClaim: false,
  };
}
