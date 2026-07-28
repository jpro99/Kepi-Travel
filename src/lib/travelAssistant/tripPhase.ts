/**
 * Mission Control brain — trip phase + Today / Week / Trip readiness (I32).
 * Composes existing reservations + gap detection; never invents bookings.
 */

import { detectTripGaps, type TripGap } from "@/lib/travelAssistant/gapDetectionService";
import {
  canonicalFlightDepartureDay,
  dateOnly,
  reservationPrimaryDate,
} from "@/lib/travelAssistant/tripWindow";
import { toUtcMs } from "@/lib/travelAssistant/journeyPhase";

export type MissionControlPhase =
  | "no_trip"
  | "planning"
  | "countdown"
  | "departure_day"
  | "at_destination"
  | "return_day"
  | "problem";

export type ReadinessStatus = "set" | "needs_you" | "watch" | "problem";

export type MissionControlZoom = "today" | "week" | "trip";

export interface MissionControlReservation {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  localTime?: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  checkOutDate?: string;
  hotelSearchCity?: string;
}

export interface LiveFlightStatusHint {
  flightStatus?: string;
  delayMinutes?: number | null;
  departureGate?: string;
  onTime?: boolean | null;
}

export interface MissionControlTripInput {
  name?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reservations: MissionControlReservation[];
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  liveStatusByReservationId?: Record<string, LiveFlightStatusHint>;
  hasActiveTrip?: boolean;
}

export interface AttentionItem {
  id: string;
  status: Exclude<ReadinessStatus, "set">;
  title: string;
  detail?: string;
  actionLabel?: string;
  actionTab?: string;
  actionContext?: TripGap["actionContext"];
  reservationId?: string;
}

export interface DayReadiness {
  dateKey: string;
  status: ReadinessStatus;
  label: string;
  summary: string;
  flights: MissionControlReservation[];
  hotels: MissionControlReservation[];
  attention: AttentionItem[];
}

export interface MissionControlSnapshot {
  phase: MissionControlPhase;
  tripName: string;
  identityLabel: string;
  daysUntilDeparture: number | null;
  today: DayReadiness;
  week: DayReadiness[];
  tripStatus: ReadinessStatus;
  tripSummary: string;
  attentionTop3: AttentionItem[];
  attentionOverflow: number;
  nextFlight: MissionControlReservation | null;
  leaveByHint: string | null;
  openAirportMode: boolean;
  tonightHotel: MissionControlReservation | null;
}

const MS_DAY = 86_400_000;

function isoDayFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addIsoDays(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`) + days * MS_DAY;
  return isoDayFromMs(ms);
}

function flightDepDay(r: MissionControlReservation): string {
  return canonicalFlightDepartureDay(r) || dateOnly(r.localTime);
}

function flightDepUtcMs(r: MissionControlReservation): number {
  const local =
    r.flightDepartureTime?.trim() ||
    (hasTime(r.localTime) ? r.localTime!.trim() : "") ||
    (r.flightDate ? `${r.flightDate.slice(0, 10)} 12:00` : "");
  if (!local) return Number.NaN;
  return toUtcMs(local.slice(0, 16).replace("T", " "), r.timezone);
}

function hasTime(localTime: string | undefined | null): boolean {
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/u.test(localTime?.trim() ?? "");
}

function isBookedFlight(r: MissionControlReservation): boolean {
  return r.type === "flight" && r.plannedOnly !== true;
}

function isBookedHotel(r: MissionControlReservation): boolean {
  return r.type === "hotel" && r.plannedOnly !== true;
}

function hotelCoversDay(hotel: MissionControlReservation, dateKey: string): boolean {
  const start = dateOnly(hotel.localTime);
  if (!start) return false;
  const end = dateOnly(hotel.checkOutDate) || start;
  return start <= dateKey && dateKey < end;
}

function formatShortTime(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isInternationalFlight(r: MissionControlReservation): boolean {
  const dep = (r.flightDepartureAirport ?? "").toUpperCase();
  const arr = (r.flightArrivalAirport ?? "").toUpperCase();
  const usLike = /^(ONT|SEA|LAX|SFO|JFK|EWR|ORD|DFW|ATL|DEN|BOS|IAD|PHX|LAS|MIA|HNL|ANC)$/u;
  if (!dep || !arr) return true;
  return !(usLike.test(dep) && usLike.test(arr));
}

/** Honest airport buffer only — no invented drive time. */
export function getLeaveByHint(flight: MissionControlReservation, nowMs = Date.now()): string | null {
  const depMs = flightDepUtcMs(flight);
  if (!Number.isFinite(depMs) || depMs <= nowMs) return null;
  if (!hasTime(flight.flightDepartureTime) && !hasTime(flight.localTime)) return null;
  const bufferMin = isInternationalFlight(flight) ? 180 : 90;
  const leaveMs = depMs - bufferMin * 60_000;
  const leaveLabel = formatShortTime(leaveMs);
  const depLabel = formatShortTime(depMs);
  if (!leaveLabel || !depLabel) return null;
  return `Leave for the airport by ${leaveLabel} (${bufferMin} min before ${depLabel} departure — drive time not included)`;
}

function statusFromGaps(gaps: TripGap[]): ReadinessStatus {
  if (gaps.some((g) => g.severity === "critical")) return "needs_you";
  if (gaps.some((g) => g.severity === "warning")) return "needs_you";
  if (gaps.some((g) => g.severity === "info")) return "watch";
  return "set";
}

function gapToAttention(gap: TripGap): AttentionItem {
  const status: AttentionItem["status"] =
    gap.severity === "info" ? "watch" : "needs_you";
  return {
    id: gap.id,
    status,
    title: gap.title,
    detail: gap.detail,
    actionLabel: gap.actionLabel,
    actionTab: gap.actionTab,
    actionContext: gap.actionContext,
  };
}

function detectProblem(
  reservations: MissionControlReservation[],
  liveStatusByReservationId: Record<string, LiveFlightStatusHint> | undefined,
  nowMs: number,
): AttentionItem | null {
  const upcomingFlights = reservations
    .filter(isBookedFlight)
    .filter((f) => {
      const ms = flightDepUtcMs(f);
      return Number.isFinite(ms) && ms > nowMs - 6 * 60 * 60_000;
    });

  for (const flight of upcomingFlights) {
    const live = liveStatusByReservationId?.[flight.id];
    const statusText = (live?.flightStatus ?? "").toLowerCase();
    if (/cancel/u.test(statusText)) {
      return {
        id: `problem-cancel-${flight.id}`,
        status: "problem",
        title: `${flight.flightNumber || flight.title || "Flight"} was cancelled`,
        detail: "Open Book or your airline to rebook — Kepi will not invent replacement flights.",
        actionLabel: "Open flights",
        actionTab: "book",
        reservationId: flight.id,
      };
    }
    if (
      (typeof live?.delayMinutes === "number" && live.delayMinutes >= 60) ||
      /delay/u.test(statusText)
    ) {
      const delay =
        typeof live?.delayMinutes === "number" && live.delayMinutes > 0
          ? `${live.delayMinutes} min`
          : "significantly";
      return {
        id: `problem-delay-${flight.id}`,
        status: "problem",
        title: `${flight.flightNumber || "Flight"} delayed ${delay}`,
        detail: live?.departureGate
          ? `Check gate ${live.departureGate} and connection times.`
          : "Check status and connections before you leave.",
        actionLabel: "Flight details",
        actionTab: "book",
        reservationId: flight.id,
      };
    }
  }
  return null;
}

function firstOutboundFlight(
  reservations: MissionControlReservation[],
  nowMs: number,
): MissionControlReservation | null {
  const flights = reservations
    .filter(isBookedFlight)
    .map((f) => ({ f, ms: flightDepUtcMs(f) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => a.ms - b.ms);
  const upcoming = flights.find((row) => row.ms >= nowMs - 2 * 60 * 60_000);
  return upcoming?.f ?? flights[0]?.f ?? null;
}

function lastReturnFlight(reservations: MissionControlReservation[]): MissionControlReservation | null {
  const flights = reservations
    .filter(isBookedFlight)
    .map((f) => ({ f, ms: flightDepUtcMs(f) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => a.ms - b.ms);
  return flights[flights.length - 1]?.f ?? null;
}

export function detectMissionPhase(
  input: MissionControlTripInput,
  nowMs = Date.now(),
): MissionControlPhase {
  const reservations = input.reservations ?? [];
  const hasTrip =
    input.hasActiveTrip !== false &&
    (Boolean(input.name?.trim()) ||
      Boolean(input.startDate) ||
      reservations.length > 0);

  if (!hasTrip) return "no_trip";

  if (detectProblem(reservations, input.liveStatusByReservationId, nowMs)) {
    return "problem";
  }

  const todayKey = isoDayFromMs(nowMs);
  const first = firstOutboundFlight(reservations, nowMs);
  const last = lastReturnFlight(reservations);
  const tripStart = dateOnly(input.startDate) || (first ? flightDepDay(first) : "");
  const tripEnd = dateOnly(input.endDate) || (last ? flightDepDay(last) : "");

  if (first && flightDepDay(first) === todayKey) return "departure_day";
  if (last && flightDepDay(last) === todayKey && (!first || first.id !== last.id)) {
    return "return_day";
  }

  if (tripStart && tripEnd && todayKey > tripStart && todayKey < tripEnd) {
    return "at_destination";
  }
  if (tripStart && todayKey > tripStart && (!tripEnd || todayKey <= tripEnd)) {
    return "at_destination";
  }

  if (tripStart) {
    const daysUntil = Math.ceil(
      (Date.parse(`${tripStart}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / MS_DAY,
    );
    if (daysUntil > 30) return "planning";
    if (daysUntil >= 0) return "countdown";
  }

  if (first) {
    const depDay = flightDepDay(first);
    const daysUntil = Math.ceil(
      (Date.parse(`${depDay}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / MS_DAY,
    );
    if (daysUntil > 30) return "planning";
    if (daysUntil >= 0) return "countdown";
  }

  return "planning";
}

function buildDayReadiness(
  dateKey: string,
  reservations: MissionControlReservation[],
  allGaps: TripGap[],
  nowMs: number,
): DayReadiness {
  const flights = reservations.filter(isBookedFlight).filter((f) => flightDepDay(f) === dateKey);
  const hotels = reservations.filter(isBookedHotel).filter((h) => hotelCoversDay(h, dateKey));
  const dayGaps = allGaps.filter((gap) => {
    const ctx = gap.actionContext;
    if (ctx?.checkIn && dateOnly(ctx.checkIn) === dateKey) return true;
    if (ctx?.checkOut && dateOnly(ctx.checkOut) === dateKey) return true;
    const blob = `${gap.title} ${gap.detail}`.toLowerCase();
    return blob.includes(dateKey);
  });

  const attention = dayGaps.slice(0, 5).map(gapToAttention);

  // Hotel night needed: stay segment missing often appears as gap; also soft-check arrival days
  const pretty = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  let status = statusFromGaps(dayGaps);
  if (attention.some((a) => a.status === "problem")) status = "problem";

  const bits: string[] = [];
  if (flights.length > 0) {
    bits.push(
      flights
        .map((f) => f.flightNumber || `${f.flightDepartureAirport}→${f.flightArrivalAirport}`)
        .join(", "),
    );
  }
  if (hotels.length > 0) {
    bits.push(hotels.map((h) => h.title || h.location || "Hotel").join(", "));
  }
  if (status === "set" && bits.length === 0) {
    bits.push("Open day");
  }

  const todayKey = isoDayFromMs(nowMs);
  if (dateKey === todayKey && flights.length === 0 && hotels.length === 0 && dayGaps.length === 0) {
    status = "watch";
  }

  return {
    dateKey,
    status,
    label: pretty,
    summary: bits.join(" · ") || (status === "set" ? "Set" : "Needs a look"),
    flights,
    hotels,
    attention,
  };
}

export function buildMissionControlSnapshot(
  input: MissionControlTripInput,
  nowMs = Date.now(),
): MissionControlSnapshot {
  const reservations = input.reservations ?? [];
  const phase = detectMissionPhase(input, nowMs);
  const todayKey = isoDayFromMs(nowMs);
  const gaps = detectTripGaps(reservations, nowMs, {
    stayDecisions: input.stayDecisions,
    tripStartDate: input.startDate,
    tripEndDate: input.endDate,
  });
  const problem = detectProblem(reservations, input.liveStatusByReservationId, nowMs);

  const attentionFromGaps = gaps.map(gapToAttention);
  const attentionAll: AttentionItem[] = problem
    ? [problem, ...attentionFromGaps.filter((a) => a.id !== problem.id)]
    : attentionFromGaps;

  const attentionTop3 = attentionAll.slice(0, 3);
  const attentionOverflow = Math.max(0, attentionAll.length - 3);

  const today = buildDayReadiness(todayKey, reservations, gaps, nowMs);
  if (problem && phase === "problem") {
    today.status = "problem";
    today.attention = [problem, ...today.attention];
    today.summary = problem.title;
  }

  const week: DayReadiness[] = [];
  for (let i = 0; i < 7; i += 1) {
    week.push(buildDayReadiness(addIsoDays(todayKey, i), reservations, gaps, nowMs));
  }

  let tripStatus: ReadinessStatus = statusFromGaps(gaps);
  if (problem) tripStatus = "problem";

  const nextFlight = firstOutboundFlight(reservations, nowMs);
  const leaveByHint =
    phase === "departure_day" || phase === "return_day" || phase === "countdown"
      ? nextFlight
        ? getLeaveByHint(nextFlight, nowMs)
        : null
      : null;

  const tonightHotel =
    reservations.filter(isBookedHotel).find((h) => hotelCoversDay(h, todayKey)) ?? null;

  const daysUntilDeparture = (() => {
    const start = dateOnly(input.startDate) || (nextFlight ? flightDepDay(nextFlight) : "");
    if (!start) return null;
    return Math.ceil(
      (Date.parse(`${start}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / MS_DAY,
    );
  })();

  const tripName = input.name?.trim() || input.destination?.trim() || "Your trip";

  const identityLabel = (() => {
    if (phase === "no_trip") return "Plan a trip";
    if (phase === "problem") return `${tripName} · Action needed`;
    if (phase === "departure_day") return `${tripName} · Today is travel day`;
    if (phase === "return_day") return `${tripName} · Heading home`;
    if (phase === "at_destination") {
      const city = tonightHotel?.hotelSearchCity || tonightHotel?.location || input.destination;
      return city ? `${tripName} · ${city}` : tripName;
    }
    if (daysUntilDeparture != null && daysUntilDeparture > 0) {
      return `${tripName} · ${daysUntilDeparture} day${daysUntilDeparture === 1 ? "" : "s"} away`;
    }
    return tripName;
  })();

  const tripSummary = (() => {
    if (phase === "no_trip") return "Add a trip to get started.";
    if (tripStatus === "problem") return problem?.title || "Something needs your attention.";
    if (tripStatus === "set") return "Trip looks set — no blocking gaps right now.";
    if (attentionTop3.length > 0) {
      return `${attentionTop3.length} item${attentionTop3.length === 1 ? "" : "s"} need you before travel.`;
    }
    return "Review your trip when you have a moment.";
  })();

  const openAirportMode =
    phase === "departure_day" ||
    phase === "return_day" ||
    (Boolean(nextFlight) &&
      Number.isFinite(flightDepUtcMs(nextFlight!)) &&
      flightDepUtcMs(nextFlight!) - nowMs < 6 * 60 * 60_000);

  return {
    phase,
    tripName,
    identityLabel,
    daysUntilDeparture,
    today,
    week,
    tripStatus,
    tripSummary,
    attentionTop3,
    attentionOverflow,
    nextFlight,
    leaveByHint,
    openAirportMode,
    tonightHotel,
  };
}

/** @deprecated name kept for tests that import day keys via reservation helpers */
export function missionControlPrimaryDate(r: MissionControlReservation): string {
  return reservationPrimaryDate(r) || dateOnly(r.localTime);
}
