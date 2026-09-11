/**
 * Home travel-day coach — train + flight same calendar day (G55).
 * Surfaces stored ticket artifacts first; honest BRI transfer cue without invented gates.
 */

import { buildBriAfterTrainCoachSteps } from "@/lib/travelAssistant/briAirportFacts";
import {
  flightDepartureUtcMs,
  selectTravelDayPrimaryFlight,
} from "@/lib/travelAssistant/flightSort";
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

export interface TravelDayWalkthroughStep {
  id: string;
  title: string;
  detail: string;
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
  walkthroughSteps: TravelDayWalkthroughStep[];
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

function trainDepartsBariCentraleFnB(reservation: HomeStayReservation): boolean {
  const blob = `${reservation.location ?? ""} ${reservation.title ?? ""}`.toLowerCase();
  return /\bbari\b/u.test(blob) && /\b(fnb|c\.le|centrale)\b/u.test(blob);
}

function formatPassengerTicketNote(handoff: TrainTicketHandoffContent | undefined): string | null {
  const tickets = handoff?.passengerTickets ?? [];
  if (tickets.length === 0) return null;
  const names = tickets.map((ticket) => ticket.passengerName.trim()).filter(Boolean);
  if (names.length === 0) return `${tickets.length} stored ticket${tickets.length === 1 ? "" : "s"} in Kepi`;
  return `Stored tickets for ${names.join(" and ")}`;
}

/** Step-by-step travel-day walkthrough from stored bookings + verified BRI facts only. */
export function buildTravelDayWalkthroughSteps(input: {
  trains: TrainTicketSourceReservation[];
  trainHandoffs: TrainTicketHandoffContent[];
  flight: HomeTravelDayFlight | null;
}): TravelDayWalkthroughStep[] {
  const steps: TravelDayWalkthroughStep[] = [];
  const flightFromBri = (input.flight?.flightDepartureAirport?.trim().toUpperCase() ?? "") === "BRI";

  input.trains.forEach((train, index) => {
    const handoff = input.trainHandoffs[index];
    const trainNo = train.trainNumber?.trim() || train.title?.trim() || "Train";
    const route = train.location?.trim() || "";
    const dep = formatLocalTime(train.localTime);
    const paxNote = formatPassengerTicketNote(handoff);
    const detailParts = [
      dep ? `Departs ${dep}` : null,
      train.confirmationCode?.trim() ? `Confirmation ${train.confirmationCode.trim()}` : null,
      paxNote,
    ].filter(Boolean);

    steps.push({
      id: `train-${train.id}`,
      title: `${trainNo}${route ? ` · ${route}` : ""}`,
      detail: detailParts.join(" · ") || "Your booked train for today.",
    });

    if (index === 0 && trainEndsAtBari(train) && input.trains.length > 1) {
      steps.push({
        id: "after-bari-centrale",
        title: "After you alight at Bari Centrale",
        detail:
          "Leave the Frecciargento and follow signs inside Bari Centrale to the Ferrovie Nord Barese (FNB) platforms for your airport connection train.",
      });
    }
  });

  const airportConnector = input.trains.find((train) => trainDepartsBariCentraleFnB(train));
  if (airportConnector && flightFromBri) {
    const connectorHandoff = input.trainHandoffs.find(
      (handoff) => handoff.reservationId === airportConnector.id,
    );
    const dep = formatLocalTime(airportConnector.localTime);
    const paxNote = formatPassengerTicketNote(connectorHandoff);
    const connectorDetail = [
      dep ? `Departs ${dep} from BARI C.LE FNB` : "Departs from BARI C.LE FNB",
      "Arrives Bari Aeroporto Karol Wojtyła rail station",
      paxNote,
    ]
      .filter(Boolean)
      .join(" · ");

    const connectorIndex = steps.findIndex((step) => step.id === `train-${airportConnector.id}`);
    if (connectorIndex >= 0) {
      steps[connectorIndex] = {
        ...steps[connectorIndex],
        detail: connectorDetail,
      };
    }
  }

  if (flightFromBri && input.flight && airportConnector) {
    steps.push(...buildBriAfterTrainCoachSteps());

    const flightNo = input.flight.flightNumber?.trim() || "Flight";
    const provider = input.flight.provider?.trim() || "ITA Airways";
    const dep = formatLocalTime(input.flight.flightDepartureTime);
    const to = input.flight.flightArrivalAirport?.trim() || "VCE";
    const arrTerminal = input.flight.flightArrivalTerminal?.trim();
    steps.push({
      id: "flight-departure",
      title: `${provider} ${flightNo} · BRI → ${to}${dep ? ` · departs ${dep}` : ""}`,
      detail: [
        input.flight.confirmationCode?.trim()
          ? `Confirmation ${input.flight.confirmationCode.trim()}`
          : null,
        arrTerminal ? `Arrive Terminal ${arrTerminal}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Your booked flight today.",
    });
  } else if (input.flight) {
    const flightNo = input.flight.flightNumber?.trim() || "Flight";
    const from = input.flight.flightDepartureAirport?.trim() || "";
    const to = input.flight.flightArrivalAirport?.trim() || "";
    const dep = formatLocalTime(input.flight.flightDepartureTime);
    steps.push({
      id: "flight-departure",
      title: `${flightNo}${from && to ? ` · ${from} → ${to}` : ""}${dep ? ` · departs ${dep}` : ""}`,
      detail: [
        input.flight.confirmationCode?.trim()
          ? `Confirmation ${input.flight.confirmationCode.trim()}`
          : null,
        input.flight.flightArrivalTerminal
          ? `Arrive Terminal ${input.flight.flightArrivalTerminal}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Your booked flight today.",
    });
  }

  return steps;
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
  const lastTrain = trains[trains.length - 1] ?? null;
  const lastTrainDepartureUtcMs = lastTrain
    ? flightDepartureUtcMs({
        localTime: lastTrain.localTime,
        timezone: lastTrain.timezone,
        flightDepartureTime: lastTrain.localTime,
      })
    : null;
  const primaryFlight =
    selectTravelDayPrimaryFlight(flights, { afterTrainDepartureUtcMs: lastTrainDepartureUtcMs }) ??
    flights[0] ??
    null;

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
  for (const train of trains) leadParts.push(trainHeadline(train));
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

  const walkthroughSteps = buildTravelDayWalkthroughSteps({
    trains,
    trainHandoffs,
    flight,
  });

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
    walkthroughSteps,
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

/** True when Home should lead with the full train+flight travel-day coach (suppress Ask Kepi / mid-stay). */
export function hasActiveTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): boolean {
  const coach = resolveTodayTravelDayCoach(input);
  if (!coach) return false;
  return coach.trainHandoffs.length > 0 || coach.flight != null;
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
