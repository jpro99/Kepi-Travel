/**
 * Stranded / missed-flight detector — honest geo + schedule signals only.
 * Never guess the traveler made the flight; never invent position.
 */

import type { UserAirportStatus } from "@/lib/travelAssistant/airportGeo";
import { flightDepartureUtcMs, type FlightSortFields } from "@/lib/travelAssistant/flightSort";

/** Minutes after scheduled departure before we ask (boarding + taxi buffer). */
export const STRANDED_DEPARTURE_GRACE_MIN = 20;

/** Still at airport up to this many hours after departure (rebook / deny scenarios). */
export const STRANDED_MAX_HOURS_AT_AIRPORT = 12;

export type StrandedDisruptionReason =
  | "overbook"
  | "denied-boarding"
  | "delay"
  | "cancel"
  | "other";

export interface StrandedFlightState {
  reservationId: string;
  detectedAt: string;
  /** User confirmed they missed / were denied / rebooked. */
  confirmed?: boolean;
  reason?: StrandedDisruptionReason;
  dismissedAt?: string;
  rebookConfirmedAt?: string;
}

export interface StrandedPrompt {
  reservationId: string;
  flightLabel: string;
  departureIata: string;
  minutesPastDeparture: number;
  headline: string;
  subline: string;
}

export interface StrandedDetectionInput {
  flight: FlightSortFields & { id: string; flightNumber?: string };
  locationStatus: UserAirportStatus;
  nowMs?: number;
  /** Schedule says airborne for this leg — do not strand. */
  journeyAirborneForThisFlight?: boolean;
  /** Live lookup says en-route / landed for this flight. */
  liveEnRoute?: boolean;
  existingState?: StrandedFlightState | null;
}

function isAtDepartureAirport(status: UserAirportStatus): boolean {
  return status === "at-airport" || status === "in-terminal";
}

export function buildStrandedFlightLabel(flight: FlightSortFields & { flightNumber?: string }): string {
  const num = flight.flightNumber?.trim();
  const from = flight.flightDepartureAirport?.trim() ?? "";
  const to = flight.flightArrivalAirport?.trim() ?? "";
  const route = from && to ? `${from}→${to}` : from || "your flight";
  return num ? `${num} · ${route}` : route;
}

/**
 * True when booked departure passed, traveler geo still at that airport,
 * and we have no signal they departed on this leg.
 */
export function detectStrandedAtAirport(input: StrandedDetectionInput): {
  shouldPrompt: boolean;
  prompt: StrandedPrompt | null;
} {
  const nowMs = input.nowMs ?? Date.now();
  const state = input.existingState;

  if (state?.dismissedAt) {
    return { shouldPrompt: false, prompt: null };
  }
  if (state?.rebookConfirmedAt) {
    return { shouldPrompt: false, prompt: null };
  }

  const depMs = flightDepartureUtcMs(input.flight);
  if (!Number.isFinite(depMs)) {
    return { shouldPrompt: false, prompt: null };
  }

  const minutesPast = (nowMs - depMs) / 60_000;
  if (minutesPast < STRANDED_DEPARTURE_GRACE_MIN) {
    return { shouldPrompt: false, prompt: null };
  }
  if (minutesPast > STRANDED_MAX_HOURS_AT_AIRPORT * 60) {
    return { shouldPrompt: false, prompt: null };
  }

  if (!isAtDepartureAirport(input.locationStatus)) {
    return { shouldPrompt: false, prompt: null };
  }

  if (input.journeyAirborneForThisFlight || input.liveEnRoute) {
    return { shouldPrompt: false, prompt: null };
  }

  const depIata = input.flight.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const flightLabel = buildStrandedFlightLabel(input.flight);

  const prompt: StrandedPrompt = {
    reservationId: input.flight.id,
    flightLabel,
    departureIata: depIata,
    minutesPastDeparture: Math.round(minutesPast),
    headline: "Did you miss this flight?",
    subline: `You're still at ${depIata || "the airport"} · ${flightLabel} was scheduled ${Math.round(minutesPast)}m ago. Were you denied boarding or rebooked?`,
  };

  return { shouldPrompt: true, prompt };
}

export function ec261EligibleReason(reason: StrandedDisruptionReason | undefined): boolean {
  return reason === "overbook" || reason === "denied-boarding" || reason === "cancel" || reason === "delay";
}

export const STRANDED_REASON_OPTIONS: ReadonlyArray<{
  id: StrandedDisruptionReason;
  label: string;
}> = [
  { id: "overbook", label: "Overbooked" },
  { id: "denied-boarding", label: "Denied boarding" },
  { id: "delay", label: "Long delay" },
  { id: "cancel", label: "Cancelled" },
  { id: "other", label: "Other" },
];
