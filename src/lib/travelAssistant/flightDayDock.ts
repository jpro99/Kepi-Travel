/**
 * G64 — Persistent flight dock: one tap to flight #, gate, route on travel day.
 * Survives refresh, travel-day coach swaps, and the 60m post-departure active-flight cliff.
 */

import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import {
  flightDepartureUtcMs,
  formatTravelDayFlightLabel,
  selectTravelDayDepartureFlight,
  type FlightSortFields,
} from "@/lib/travelAssistant/flightSort";
import {
  flightArrivalUtcMs,
  REMAINING_ARRIVAL_ACTIVE_MS,
  selectRemainingJourneyFlight,
} from "@/lib/travelAssistant/remainingJourneyFlight";
import {
  selectActiveFlight,
  selectNavigatorFlight,
  type FlightReservation,
} from "@/lib/travelAssistant/useActiveFlight";
import { formatFlightStatusTrustLine, type FlightStatusTrustInput } from "@/lib/travelAssistant/flightStatusTrustLine";

const MS_PER_HOUR = 3_600_000;
const PIN_AHEAD_HOURS = 24;
const PIN_BEHIND_HOURS = 1;

export type FlightDayDockPhase = "upcoming" | "at-airport" | "in-flight" | "landed";

export interface FlightDayDockModel {
  reservationId: string;
  eyebrow: string;
  title: string;
  detail: string | null;
  phase: FlightDayDockPhase;
  ctaLabel: string;
}

function asFlightReservation(f: FlightSortFields): FlightReservation {
  return f as FlightReservation;
}

/** Flight the traveler should see on the pinned dock today. */
export function selectFlightDayDockFlight(
  reservations: readonly FlightSortFields[],
  journeyPhase: JourneyPhase,
  nowMs: number = Date.now(),
): FlightSortFields | null {
  if (journeyPhase.kind === "airborne") {
    return journeyPhase.onFlight as FlightSortFields;
  }
  if (journeyPhase.kind === "just-landed") {
    return journeyPhase.flight as FlightSortFields;
  }

  const booked = reservations.filter(
    (r) => (r.type ?? "flight").toLowerCase() === "flight",
  ) as FlightReservation[];

  const navigator = selectNavigatorFlight(booked, nowMs, journeyPhase);
  if (navigator) return navigator.f;

  const today = selectTravelDayDepartureFlight(booked, nowMs);
  if (today) return today.f;

  const remaining = selectRemainingJourneyFlight(booked, nowMs);
  if (remaining) return remaining;

  const active = selectActiveFlight(booked, nowMs);
  if (active) return active.f;

  if (journeyPhase.kind === "pre-trip" && journeyPhase.daysUntil <= 1) {
    return journeyPhase.nextFlight as FlightSortFields;
  }

  return null;
}

export function resolveFlightDayDockPhase(
  flight: FlightSortFields,
  journeyPhase: JourneyPhase,
  nowMs: number = Date.now(),
): FlightDayDockPhase {
  if (journeyPhase.kind === "airborne") return "in-flight";
  if (journeyPhase.kind === "just-landed") return "landed";

  const depMs = flightDepartureUtcMs(flight);
  const arrMs = flightArrivalUtcMs(flight);
  if (!Number.isNaN(depMs) && !Number.isNaN(arrMs) && nowMs >= depMs && nowMs < arrMs) {
    return "in-flight";
  }
  if (!Number.isNaN(arrMs) && nowMs >= arrMs && nowMs < arrMs + REMAINING_ARRIVAL_ACTIVE_MS) {
    return "landed";
  }
  if (!Number.isNaN(depMs) && nowMs >= depMs - 3 * MS_PER_HOUR && nowMs < depMs + MS_PER_HOUR) {
    return "at-airport";
  }
  return "upcoming";
}

/** Pin dock from 24h before departure through post-landing coach window. */
export function shouldPinFlightDayDock(
  flight: FlightSortFields | null | undefined,
  journeyPhase: JourneyPhase,
  nowMs: number = Date.now(),
): boolean {
  if (!flight) return false;
  if (journeyPhase.kind === "airborne" || journeyPhase.kind === "just-landed") return true;

  const depMs = flightDepartureUtcMs(flight);
  if (Number.isNaN(depMs)) {
    return selectTravelDayDepartureFlight([flight], nowMs) != null;
  }

  const hoursUntil = (depMs - nowMs) / MS_PER_HOUR;
  if (hoursUntil <= PIN_AHEAD_HOURS && hoursUntil >= -PIN_BEHIND_HOURS) return true;

  const arrMs = flightArrivalUtcMs(flight);
  if (!Number.isNaN(arrMs) && nowMs >= depMs && nowMs < arrMs + REMAINING_ARRIVAL_ACTIVE_MS) {
    return true;
  }

  return selectTravelDayDepartureFlight([flight], nowMs) != null;
}

export function buildFlightDayDockModel(
  flight: FlightSortFields,
  journeyPhase: JourneyPhase,
  liveStatus?: FlightStatusTrustInput,
  nowMs: number = Date.now(),
): FlightDayDockModel {
  const phase = resolveFlightDayDockPhase(flight, journeyPhase, nowMs);
  const reservation = asFlightReservation(flight);
  const route = [flight.flightDepartureAirport, flight.flightArrivalAirport].filter(Boolean).join(" → ");
  const label = formatTravelDayFlightLabel(flight);

  let eyebrow = "Flight today";
  let ctaLabel = "Open airport mode";
  if (phase === "in-flight") {
    eyebrow =
      journeyPhase.kind === "airborne"
        ? `In flight · lands ${journeyPhase.landingAt}`
        : `In flight · ${flight.flightArrivalAirport ?? "destination"}`;
    ctaLabel = `Landing plan — ${flight.flightArrivalAirport ?? "arrival"}`;
  } else if (phase === "landed") {
    eyebrow = "Just landed";
    ctaLabel = `Arrival at ${flight.flightArrivalAirport ?? "airport"}`;
  } else if (phase === "at-airport") {
    eyebrow = flight.flightDepartureAirport
      ? `At ${flight.flightDepartureAirport}`
      : "At the airport";
    ctaLabel = "Gate & terminal map";
  }

  const trustLine = formatFlightStatusTrustLine({
    ...liveStatus,
    bookedGate: liveStatus?.bookedGate ?? reservation.flightDepartureGate,
    bookedStatus: liveStatus?.bookedStatus ?? reservation.flightStatus,
    departureIata: flight.flightDepartureAirport,
  });

  const detail =
    phase === "in-flight"
      ? route
        ? `${label} · ${route}`
        : label
      : trustLine ?? (route ? route : null);

  return {
    reservationId: reservation.id,
    eyebrow,
    title: label,
    detail,
    phase,
    ctaLabel,
  };
}
