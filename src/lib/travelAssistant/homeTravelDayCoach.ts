/**
 * Home travel-day coach — train + flight same calendar day (G55).
 * Surfaces stored ticket artifacts first; honest BRI transfer cue without invented gates.
 */

import { canonicalFlightDepartureDay } from "@/lib/travelAssistant/tripWindow";
import type { HomeNextAction } from "@/lib/travelAssistant/homeNextAction";
import {
  addIsoDays,
  dateOnly,
  formatLocalTime,
  type HomeStayReservation,
  travelerTodayKey,
} from "@/lib/travelAssistant/homeTodayCoach";
import {
  buildTrainTicketHandoffContent,
  isBookedTrainReservation,
  trainReservationsOnDay,
  type TrainTicketHandoffContent,
  type TrainTicketSourceReservation,
} from "@/lib/travelAssistant/trainTicketHandoff";

export interface HomeTravelDayFlight {
  id: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightArrivalTerminal?: string;
  confirmationCode?: string | null;
  provider?: string;
}

export interface HomeTravelDayCoach {
  dateKey: string;
  dayLabel: string;
  headline: string;
  leadDetail: string;
  trainHandoffs: TrainTicketHandoffContent[];
  flight: HomeTravelDayFlight | null;
  leaveCue: string | null;
  airportTransferHint: string | null;
  hasTrainBeforeFlight: boolean;
}

function formatShortDayLabel(dateKey: string, timezone?: string | null): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone?.trim() || "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(ms));
  } catch {
    return dateKey;
  }
}

function isBookedFlight(reservation: HomeStayReservation): boolean {
  if ((reservation.type ?? "").toLowerCase() !== "flight") return false;
  if (reservation.plannedOnly === true) return false;
  return Boolean(reservation.flightDepartureAirport || reservation.flightNumber);
}

function flightDepDay(reservation: HomeStayReservation): string {
  return canonicalFlightDepartureDay(reservation) || dateOnly(reservation.localTime);
}

function flightsOnDay(reservations: HomeStayReservation[], dateKey: string): HomeStayReservation[] {
  return reservations
    .filter(isBookedFlight)
    .filter((row) => flightDepDay(row) === dateKey)
    .sort((a, b) => (a.flightDepartureTime ?? a.localTime ?? "").localeCompare(b.flightDepartureTime ?? b.localTime ?? ""));
}

function trainHeadline(reservation: HomeStayReservation): string {
  const route = reservation.location?.trim() || "Train";
  const label = [reservation.provider?.trim(), reservation.trainNumber?.trim() || reservation.title?.trim()]
    .filter(Boolean)
    .join(" ");
  const time = formatLocalTime(reservation.localTime);
  const bits = [label, route, time ? `departs ${time}` : ""].filter(Boolean);
  return bits.join(" · ") || route;
}

function flightHeadline(flight: HomeTravelDayFlight): string {
  const from = flight.flightDepartureAirport?.trim() || "";
  const to = flight.flightArrivalAirport?.trim() || "";
  const route = from && to ? `${from} → ${to}` : "Flight";
  const num = flight.flightNumber?.trim();
  const time = formatLocalTime(flight.flightDepartureTime);
  const bits = [num ? `${num} · ${route}` : route, time ? `departs ${time}` : ""].filter(Boolean);
  return bits.join(" · ");
}

/**
 * Honest station-to-airport cue when a train ends in Bari and a flight departs BRI same day.
 * BRI terminal/gate details are not verified in Kepi — never invent them.
 */
export function buildBriAirportTransferHint(input: {
  trainArrivesBari: boolean;
  flightFromBri: boolean;
}): string | null {
  if (!input.trainArrivesBari || !input.flightFromBri) return null;
  return (
    "After your train reaches Bari Centrale, continue to Bari Karol Wojtyła Airport (BRI) for your flight. " +
    "Allow extra time for the station-to-airport transfer — Kepi does not have verified BRI terminal or gate details."
  );
}

function trainEndsAtBari(reservation: HomeStayReservation): boolean {
  const blob = `${reservation.location ?? ""} ${reservation.title ?? ""}`.toLowerCase();
  return /\bbari\b/u.test(blob);
}

export function buildHomeTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  dateKey: string;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): HomeTravelDayCoach | null {
  const trains = trainReservationsOnDay(
    input.reservations as TrainTicketSourceReservation[],
    input.dateKey,
  );
  const flights = flightsOnDay(input.reservations, input.dateKey);

  if (trains.length === 0 && flights.length === 0) return null;

  const trainHandoffs = trains
    .map((train) => buildTrainTicketHandoffContent(train, input.tripId))
    .filter((content): content is TrainTicketHandoffContent => Boolean(content));

  const primaryTrain = trains[0] ?? null;
  const primaryFlight = flights[0] ?? null;

  const flight: HomeTravelDayFlight | null = primaryFlight
    ? {
        id: primaryFlight.id,
        flightNumber: primaryFlight.flightNumber,
        flightDepartureAirport: primaryFlight.flightDepartureAirport,
        flightArrivalAirport: primaryFlight.flightArrivalAirport,
        flightDepartureTime: primaryFlight.flightDepartureTime ?? primaryFlight.localTime,
        flightArrivalTime: primaryFlight.flightArrivalTime,
        flightArrivalTerminal: primaryFlight.flightArrivalTerminal,
        confirmationCode: primaryFlight.confirmationCode,
        provider: primaryFlight.provider,
      }
    : null;

  const hasTrainBeforeFlight = Boolean(primaryTrain && primaryFlight);
  const airportTransferHint = buildBriAirportTransferHint({
    trainArrivesBari: primaryTrain ? trainEndsAtBari(primaryTrain) : false,
    flightFromBri: (flight?.flightDepartureAirport?.trim().toUpperCase() ?? "") === "BRI",
  });

  const dayLabel = formatShortDayLabel(input.dateKey, input.timezone);
  const headline = (() => {
    if (primaryTrain && primaryFlight) {
      const trainRoute = primaryTrain.location?.trim() || "your train";
      const arr = primaryFlight.flightArrivalAirport?.trim() || "destination";
      return `Travel day — ${trainRoute}, then fly to ${arr}`;
    }
    if (primaryTrain) return `Travel day — ${primaryTrain.location?.trim() || "train"}`;
    if (primaryFlight) {
      const from = primaryFlight.flightDepartureAirport?.trim() || "";
      const to = primaryFlight.flightArrivalAirport?.trim() || "";
      return from && to ? `Travel day — ${from} → ${to}` : "Travel day";
    }
    return "Travel day";
  })();

  const leadParts: string[] = [];
  if (primaryTrain) leadParts.push(trainHeadline(primaryTrain));
  if (flight) leadParts.push(flightHeadline(flight));
  if (flight?.confirmationCode?.trim()) {
    leadParts.push(`Confirmation ${flight.confirmationCode.trim()}`);
  }
  const leadDetail = leadParts.join(" · ") || "Your booked travel for today.";

  const leaveCue = (() => {
    if (primaryTrain) {
      const dep = formatLocalTime(primaryTrain.localTime);
      if (dep && input.flightLeaveByHint) {
        return `Train departs ${dep} · ${input.flightLeaveByHint}`;
      }
      if (dep) return `Train departs ${dep} · ${dayLabel}`;
    }
    return input.flightLeaveByHint ?? null;
  })();

  return {
    dateKey: input.dateKey,
    dayLabel,
    headline,
    leadDetail,
    trainHandoffs,
    flight,
    leaveCue,
    airportTransferHint,
    hasTrainBeforeFlight,
  };
}

/** True when calendar day has at least one booked train or flight segment. */
export function dayHasBookedTravelMoves(
  reservations: HomeStayReservation[],
  dateKey: string,
): boolean {
  const trains = reservations
    .filter((row) => isBookedTrainReservation(row as TrainTicketSourceReservation))
    .filter((row) => dateOnly(row.localTime) === dateKey);
  const flights = flightsOnDay(reservations, dateKey);
  return trains.length > 0 || flights.length > 0;
}

export function resolveTodayTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): HomeTravelDayCoach | null {
  const nowMs = input.nowMs ?? Date.now();
  const dateKey = travelerTodayKey(nowMs, input.timezone ?? null);
  return buildHomeTravelDayCoach({
    reservations: input.reservations,
    dateKey,
    timezone: input.timezone,
    tripId: input.tripId,
    flightLeaveByHint: input.flightLeaveByHint,
  });
}

/** Eve-before preview: tomorrow is a multi-segment travel day. */
export function resolveTomorrowTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  tripId?: string | null;
}): HomeTravelDayCoach | null {
  const nowMs = input.nowMs ?? Date.now();
  const todayKey = travelerTodayKey(nowMs, input.timezone ?? null);
  const tomorrowKey = addIsoDays(todayKey, 1);
  if (!dayHasBookedTravelMoves(input.reservations, tomorrowKey)) return null;
  return buildHomeTravelDayCoach({
    reservations: input.reservations,
    dateKey: tomorrowKey,
    timezone: input.timezone,
    tripId: input.tripId,
  });
}

export function homeTravelDayCoachNextAction(
  coach: HomeTravelDayCoach,
  options?: { primaryTicketUrl?: string | null },
): HomeNextAction {
  const ticketUrl = options?.primaryTicketUrl ?? coach.trainHandoffs[0]?.primaryActionUrl ?? null;
  if (ticketUrl) {
    return {
      kind: "prep",
      eyebrow: `Travel day · ${coach.dayLabel}`,
      title: coach.headline,
      detail: coach.leadDetail,
      ctaLabel: "Train tickets",
      prepHref: ticketUrl,
      reservationId: coach.trainHandoffs[0]?.reservationId,
    };
  }
  if (coach.flight?.id) {
    return {
      kind: "flight",
      eyebrow: `Travel day · ${coach.dayLabel}`,
      title: coach.headline,
      detail: coach.leadDetail,
      ctaLabel: "Open flight",
      reservationId: coach.flight.id,
    };
  }
  return {
    kind: "ready",
    eyebrow: `Travel day · ${coach.dayLabel}`,
    title: coach.headline,
    detail: coach.leadDetail,
    ctaLabel: "Open Plan",
  };
}
