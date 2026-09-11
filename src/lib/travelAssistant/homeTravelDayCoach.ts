/**
 * Home travel-day coach — train + flight same calendar day (G55).
 * Surfaces stored ticket artifacts first; honest BRI transfer cue without invented gates.
 */

import { buildBriAfterTrainCoachSteps } from "@/lib/travelAssistant/briAirportFacts";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";
import {
  composeTravelDayFlightView,
  isBookedFlightReservation,
  normalizeTravelDayFlightReservation,
  selectTravelDayPrimaryFlightReservation,
} from "@/lib/travelAssistant/travelDayFlightView";
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
  type TrainTicketHandoffContent,
  type TrainTicketSourceReservation,
} from "@/lib/travelAssistant/trainTicketHandoff";
import { trainReservationsOnDayExpanded } from "@/lib/travelAssistant/travelDayTrainExpand";

export interface HomeTravelDayFlight {
  id: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightArrivalTerminal?: string;
  flightConnectionStops?: number;
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
  /** BRI KW→tunnel→arrivals→isole — promoted above fold when Reg 91312 / airport rail present. */
  briAirportCoachSteps: TravelDayWalkthroughStep[];
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
  return isBookedFlightReservation(reservation);
}

function flightDepDay(reservation: HomeStayReservation): string {
  return canonicalFlightDepartureDay(reservation) || dateOnly(reservation.localTime);
}

function flightsOnDay(reservations: HomeStayReservation[], dateKey: string): HomeStayReservation[] {
  return reservations
    .map(normalizeTravelDayFlightReservation)
    .filter(isBookedFlight)
    .filter((row) => flightDepDay(row) === dateKey)
    .sort((a, b) => (a.flightDepartureTime ?? a.localTime ?? "").localeCompare(b.flightDepartureTime ?? b.localTime ?? ""));
}

function trainHeadline(
  reservation: Pick<
    HomeStayReservation,
    "location" | "title" | "provider" | "trainNumber" | "localTime"
  >,
): string {
  const route = reservation.location?.trim() || "Train";
  const label = [reservation.provider?.trim(), reservation.trainNumber?.trim() || reservation.title?.trim()]
    .filter(Boolean)
    .join(" ");
  const time = formatLocalTime(reservation.localTime);
  const bits = [label, route, time ? `departs ${time}` : ""].filter(Boolean);
  return bits.join(" · ") || route;
}

function formatFlightConnectionStops(stops?: number | null): string | null {
  if (stops == null || !Number.isFinite(stops)) return null;
  if (stops === 0) return "Nonstop";
  if (stops === 1) return "1 stop";
  return `${stops} stops`;
}

function formatFlightTimeRange(
  departureTime?: string,
  arrivalTime?: string,
): string | null {
  const dep = formatLocalTime(departureTime);
  const arr = formatLocalTime(arrivalTime);
  if (dep && arr) return `${dep}–${arr}`;
  if (dep) return `departs ${dep}`;
  if (arr) return `arrives ${arr}`;
  return null;
}

function formatArrivalTerminalLabel(arrivalAirport?: string, terminal?: string): string | null {
  const to = arrivalAirport?.trim() || "";
  const term = terminal?.trim();
  if (to && term) return `${to} T${term}`;
  if (term) return `Arrive Terminal ${term}`;
  return null;
}

/** Stored-booking flight lead — gospel order: conf · route · times · stops · terminal. Never invent flight number. */
export function formatTravelDayFlightLead(flight: HomeTravelDayFlight): string {
  const from = flight.flightDepartureAirport?.trim() || "";
  const to = flight.flightArrivalAirport?.trim() || "";
  const route = from && to ? `${from} → ${to}` : "";
  const num = flight.flightNumber?.trim();
  const conf = flight.confirmationCode?.trim();
  const bits = [
    conf ? `Confirmation ${conf}` : null,
    route || null,
    formatFlightTimeRange(flight.flightDepartureTime, flight.flightArrivalTime),
    formatFlightConnectionStops(flight.flightConnectionStops),
    formatArrivalTerminalLabel(to, flight.flightArrivalTerminal),
    num || null,
  ].filter(Boolean);
  return bits.join(" · ") || route || "Your flight today";
}

function flightHeadline(flight: HomeTravelDayFlight): string {
  return formatTravelDayFlightLead(flight);
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

function trainEndsAtBari(reservation: Pick<TrainTicketSourceReservation, "location" | "title">): boolean {
  const blob = `${reservation.location ?? ""} ${reservation.title ?? ""}`.toLowerCase();
  return /\bbari\b/u.test(blob);
}

function trainDepartsBariCentraleFnB(
  reservation: Pick<TrainTicketSourceReservation, "location" | "title">,
): boolean {
  const blob = `${reservation.location ?? ""} ${reservation.title ?? ""}`.toLowerCase();
  return /\bbari\b/u.test(blob) && /\b(fnb|c\.le|centrale)\b/u.test(blob);
}

function trainArrivesBariAirport(
  reservation: Pick<TrainTicketSourceReservation, "location" | "title">,
): boolean {
  const blob = `${reservation.location ?? ""} ${reservation.title ?? ""}`.toLowerCase();
  return /\bbari\b/u.test(blob) && /\b(aeroporto|airport|karol|wojty)/u.test(blob);
}

function hasBariAirportRailConnector(trains: TrainTicketSourceReservation[]): boolean {
  return trains.some((train) => trainDepartsBariCentraleFnB(train) || trainArrivesBariAirport(train));
}

/** Merged gospel arrival — VCE reads as Venice; never use connector leg FCO. */
export function formatTravelDayArrivalLabel(flight: HomeTravelDayFlight): string {
  const iata = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
  if (iata === "VCE") return "Venice";
  return iata || "destination";
}

export function buildTravelDayHeadline(
  trains: TrainTicketSourceReservation[],
  flight: HomeTravelDayFlight | null,
): string {
  if (!flight) {
    if (trains.length === 1) {
      return `Travel day — ${trains[0]!.location?.trim() || "train"}`;
    }
    if (trains.length > 1) return "Travel day — multi-leg trains";
    return "Travel day";
  }

  const arrival = formatTravelDayArrivalLabel(flight);
  const departsBri = (flight.flightDepartureAirport?.trim().toUpperCase() ?? "") === "BRI";

  if (departsBri && hasBariAirportRailConnector(trains)) {
    return `Travel day — trains to Bari, then fly to ${arrival}`;
  }
  if (departsBri && trains.some((train) => trainEndsAtBari(train))) {
    return `Travel day — train to Bari, then fly to ${arrival}`;
  }
  if (departsBri) {
    return `Travel day — fly to ${arrival}`;
  }

  const from = flight.flightDepartureAirport?.trim() || "";
  const to = flight.flightArrivalAirport?.trim() || "";
  if (from && to) return `Travel day — ${from} → ${to}`;
  return `Travel day — fly to ${arrival}`;
}

export function isBriAirportCoachStep(step: TravelDayWalkthroughStep): boolean {
  return step.id.startsWith("bri-");
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

  const airportConnector =
    input.trains.find((train) => trainDepartsBariCentraleFnB(train)) ??
    input.trains.find((train) => trainArrivesBariAirport(train));
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

    steps.push({
      id: "flight-departure",
      title: formatTravelDayFlightLead(input.flight),
      detail: "Your booked flight today.",
    });
  } else if (input.flight) {
    steps.push({
      id: "flight-departure",
      title: formatTravelDayFlightLead(input.flight),
      detail: "Your booked flight today.",
    });
  }

  return steps;
}

export function inferTravelerTimezoneFromReservations(
  reservations: readonly HomeStayReservation[],
): string | null {
  for (const row of reservations) {
    const tz = row.timezone?.trim();
    if (tz && tz !== "UTC" && tz !== "Etc/UTC") return tz;
  }
  return null;
}

export function resolveEffectiveTravelTimezone(
  reservations: readonly HomeStayReservation[],
  travelerTimezone?: string | null,
): string | null {
  const explicit = travelerTimezone?.trim();
  if (explicit && explicit !== "UTC" && explicit !== "Etc/UTC") return explicit;
  return inferTravelerTimezoneFromReservations(reservations);
}

export function buildHomeTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  dateKey: string;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): HomeTravelDayCoach | null {
  const trains = trainReservationsOnDayExpanded(
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
        timezone: lastTrain.timezone ?? undefined,
        flightDepartureTime: lastTrain.localTime,
      })
    : null;
  const flightPick = selectTravelDayPrimaryFlightReservation(flights, {
    afterTrainDepartureUtcMs: lastTrainDepartureUtcMs,
  });
  const flight: HomeTravelDayFlight | null = flightPick
    ? composeTravelDayFlightView(flightPick)
    : null;

  const hasTrainBeforeFlight = Boolean(primaryTrain && flight);
  const airportTransferHint = buildBriAirportTransferHint({
    trainArrivesBari: primaryTrain ? trainEndsAtBari(primaryTrain) : false,
    flightFromBri: (flight?.flightDepartureAirport?.trim().toUpperCase() ?? "") === "BRI",
  });

  const dayLabel = formatShortDayLabel(input.dateKey, input.timezone);
  const headline = buildTravelDayHeadline(trains, flight);

  const leadParts: string[] = [];
  for (const train of trains) leadParts.push(trainHeadline(train));
  if (flight) leadParts.push(flightHeadline(flight));
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

  const allWalkthroughSteps = buildTravelDayWalkthroughSteps({
    trains,
    trainHandoffs,
    flight,
  });
  const briAirportCoachSteps = allWalkthroughSteps.filter(isBriAirportCoachStep);
  const walkthroughSteps = allWalkthroughSteps.filter((step) => !isBriAirportCoachStep(step));

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
    briAirportCoachSteps,
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

/** Train + flight on the same calendar day — Sep 12 Bari→Venice travel-day pattern. */
export function isTrainFlightTravelDayPattern(
  reservations: HomeStayReservation[],
  dateKey: string,
): boolean {
  const trains = trainReservationsOnDayExpanded(
    reservations as TrainTicketSourceReservation[],
    dateKey,
  );
  if (trains.length === 0) return false;
  return flightsOnDay(reservations, dateKey).length > 0;
}

export interface ActiveTravelDayCoachResult {
  coach: HomeTravelDayCoach;
  mode: "today" | "tomorrow";
  dateKey: string;
}

/** Today travel-day coach, or tomorrow's when eve-before (suppresses Lecce mid-stay lead). */
export function resolveActiveTravelDayCoach(input: {
  reservations: HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): ActiveTravelDayCoachResult | null {
  const nowMs = input.nowMs ?? Date.now();
  const timezone = resolveEffectiveTravelTimezone(input.reservations, input.timezone);
  const todayKey = travelerTodayKey(nowMs, timezone);

  if (isTrainFlightTravelDayPattern(input.reservations, todayKey)) {
    const coach = buildHomeTravelDayCoach({
      reservations: input.reservations,
      dateKey: todayKey,
      timezone,
      tripId: input.tripId,
      flightLeaveByHint: input.flightLeaveByHint,
    });
    if (coach) return { coach, mode: "today", dateKey: todayKey };
  }

  const tomorrowKey = addIsoDays(todayKey, 1);
  if (isTrainFlightTravelDayPattern(input.reservations, tomorrowKey)) {
    const coach = buildHomeTravelDayCoach({
      reservations: input.reservations,
      dateKey: tomorrowKey,
      timezone,
      tripId: input.tripId,
      flightLeaveByHint: input.flightLeaveByHint,
    });
    if (coach) return { coach, mode: "tomorrow", dateKey: tomorrowKey };
  }

  return null;
}

/** Above-fold Home lead text for regression tests — mirrors Mission Control travel-day hero. */
export function buildHomeFirstPaintLead(input: {
  reservations: HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  tripId?: string | null;
  flightLeaveByHint?: string | null;
}): {
  headline: string;
  summary: string;
  nextFlightText: string | null;
  aboveFoldText: string;
  travelDayLead: boolean;
} {
  const active = resolveActiveTravelDayCoach(input);
  if (!active) {
    return {
      headline: "",
      summary: "",
      nextFlightText: null,
      aboveFoldText: "",
      travelDayLead: false,
    };
  }
  const { coach } = active;
  const nextFlightText = coach.flight ? formatTravelDayFlightLead(coach.flight) : null;
  const aboveFoldText = [
    coach.headline,
    coach.leadDetail,
    ...coach.briAirportCoachSteps.map((step) => `${step.title} ${step.detail}`),
    ...coach.trainHandoffs.map((handoff) => `${handoff.headline} ${handoff.detail}`),
    ...coach.walkthroughSteps.map((step) => `${step.title} ${step.detail}`),
    nextFlightText ?? "",
  ].join(" ");
  return {
    headline: coach.headline,
    summary: `${coach.dayLabel} — ${coach.leadDetail}`,
    nextFlightText,
    aboveFoldText,
    travelDayLead: true,
  };
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
  return resolveActiveTravelDayCoach(input) != null;
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
