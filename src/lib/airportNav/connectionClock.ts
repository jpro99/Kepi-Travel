/**
 * Honest hub connection clock — make/miss equation from booked facts + layout walk
 * when available. Not Flighty-style typical-times or gate ML.
 *
 * Equation (minutes):
 *   leftover = (outbound boarding-close) − (inbound actual/est arrival)
 *            − deplane buffer − schematic walk − TSA intl re-clear − slack
 *
 * Unknown walk widens the buffer; never invent an exact gate.
 */

import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { computeRoute, resolveGateNode } from "@/lib/airportNav/pathfinder";
import { TRAVEL_DAY_PRESSURE_WINDOW_MIN } from "@/lib/airportNav/gateConfidence";
import type { GateConfidenceResult } from "@/lib/airportNav/gateConfidence";
import { timezoneForIata } from "@/lib/airports/lookup";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import {
  buildConnectionPlaybook,
  connectionPlaybookForFlight,
  resolveConnectionSpotlightIndex,
  type ConnectionPlaybook,
  type ConnectionPlaybookStep,
} from "@/lib/travelAssistant/connectionPlaybook";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
import { toUtcMs } from "@/lib/travelAssistant/journeyPhase";

export type ConnectionCoachState = "fine" | "tight" | "go_now" | "miss" | "recover";

export interface HubConnectionLeg {
  reservationId: string;
  flightNumber: string | null;
  airline: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  arrivalGate: string | null;
  departureGate: string | null;
  arrivalTerminal: string | null;
  departureTerminal: string | null;
  arrivalUtcMs: number;
  departureUtcMs: number;
  delayMinutes: number;
}

export interface HubConnectionContext {
  hubIata: string;
  inbound: HubConnectionLeg;
  outbound: HubConnectionLeg;
  playbook: ConnectionPlaybook;
  /** Same PNR — bags usually checked through. */
  bagsCheckedThrough: boolean;
}

export interface SeaConnectionStep {
  id: string;
  icon: string;
  text: string;
  detail?: string;
  minutes: number | null;
}

const DEFAULT_BOARDING_CLOSE_LEAD_MIN = 15;
const DEPLANE_BUFFER_MIN = 10;
const CONNECTION_SLACK_MIN = 5;
const UNKNOWN_WALK_ESTIMATE_MIN = 12;
const UNKNOWN_WALK_BUFFER_MIN = 18;
const TSA_INTL_RECLEAR_MIN = 18;
const TSA_INTL_RECLEAR_PRECHECK_MIN = 12;
const MAX_DISPLAY_SPARE_MIN = 180;
const MIN_DISPLAY_SPARE_MIN = -120;

function clampSpare(spare: number): number {
  return Math.max(MIN_DISPLAY_SPARE_MIN, Math.min(MAX_DISPLAY_SPARE_MIN, Math.round(spare)));
}

function flightArrivalUtcMs(res: TransportRouteReservation): number {
  const arrIata = res.flightArrivalAirport?.trim().toUpperCase() ?? "";
  const tz = timezoneForIata(arrIata) ?? res.timezone;
  if (res.flightArrivalTime?.trim()) {
    const ms = toUtcMs(res.flightArrivalTime, tz);
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.NaN;
}

function flightDepartureUtcMs(res: TransportRouteReservation): number {
  const depIata = res.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const tz = timezoneForIata(depIata) ?? res.timezone;
  if (res.flightDepartureTime?.trim()) {
    const ms = toUtcMs(res.flightDepartureTime, tz);
    if (!Number.isNaN(ms)) return ms;
  }
  if (res.localTime?.trim()) {
    const ms = toUtcMs(res.localTime, tz);
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.NaN;
}

function reservationToLeg(
  res: TransportRouteReservation,
  role: "inbound" | "outbound",
): HubConnectionLeg | null {
  const arrivalUtcMs = flightArrivalUtcMs(res);
  const departureUtcMs = flightDepartureUtcMs(res);
  const delayMinutes =
    role === "inbound"
      ? Number((res as { flightDelayMinutes?: number }).flightDelayMinutes ?? 0)
      : 0;
  if (Number.isNaN(arrivalUtcMs) || Number.isNaN(departureUtcMs)) return null;
  return {
    reservationId: res.id,
    flightNumber: res.flightNumber ?? null,
    airline: res.flightAirline ?? res.provider ?? null,
    departureAirport: res.flightDepartureAirport ?? null,
    arrivalAirport: res.flightArrivalAirport ?? null,
    arrivalGate: (res as { flightArrivalGate?: string }).flightArrivalGate ?? null,
    departureGate: (res as { flightDepartureGate?: string }).flightDepartureGate ?? null,
    arrivalTerminal: (res as { flightArrivalTerminal?: string }).flightArrivalTerminal ?? null,
    departureTerminal: (res as { flightDepartureTerminal?: string }).flightDepartureTerminal ?? null,
    arrivalUtcMs: arrivalUtcMs + delayMinutes * 60_000,
    departureUtcMs,
    delayMinutes,
  };
}

/** Find same-airport connection at hub when outbound reservation is known. */
export function resolveHubConnection(
  reservations: readonly TransportRouteReservation[],
  hubIata: string,
  outboundReservationId: string | null | undefined,
  nowMs = Date.now(),
): HubConnectionContext | null {
  const hub = hubIata.trim().toUpperCase();
  if (!hub || !outboundReservationId) return null;

  const route = buildTripTransportRoute([...reservations]);
  const flights = route.segments.filter((s) => s.kind === "flight" && s.booked);
  for (let i = 0; i < flights.length - 1; i++) {
    const inboundSeg = flights[i]!;
    const outboundSeg = flights[i + 1]!;
    if (inboundSeg.toCode !== hub || outboundSeg.fromCode !== hub) continue;
    if (outboundSeg.reservationId !== outboundReservationId) continue;

    const inboundRes = reservations.find((r) => r.id === inboundSeg.reservationId);
    const outboundRes = reservations.find((r) => r.id === outboundSeg.reservationId);
    if (!inboundRes || !outboundRes) continue;

    const inbound = reservationToLeg(inboundRes, "inbound");
    const outbound = reservationToLeg(outboundRes, "outbound");
    if (!inbound || !outbound) continue;
    if (outbound.departureUtcMs <= inbound.arrivalUtcMs) continue;

    const playbook =
      connectionPlaybookForFlight(reservations, outboundReservationId, nowMs) ??
      buildConnectionPlaybook(reservations, nowMs, { requireActiveWindow: false });
    if (!playbook || playbook.hubIata !== hub) continue;

    const inboundCode = inboundRes.confirmationCode?.trim();
    const outboundCode = outboundRes.confirmationCode?.trim();
    const bagsCheckedThrough = Boolean(inboundCode && inboundCode === outboundCode);

    return { hubIata: hub, inbound, outbound, playbook, bagsCheckedThrough };
  }
  return null;
}

/** True when hub has inbound arrival + later outbound on the same trip. */
export function isHubConnectionActive(
  ctx: HubConnectionContext,
  nowMs = Date.now(),
): boolean {
  const { inbound, outbound } = ctx;
  const windowStart = inbound.arrivalUtcMs - 2 * 60 * 60_000;
  const windowEnd = outbound.departureUtcMs + 60 * 60_000;
  return nowMs >= windowStart && nowMs <= windowEnd;
}

function isDomesticUs(iata: string): boolean {
  return /^(ONT|SEA|LAX|SFO|JFK|EWR|ORD|DFW|ATL|DEN|BOS|IAD|PHX|LAS|MIA|HNL|ANC)$/u.test(
    iata.trim().toUpperCase(),
  );
}

function needsIntlReclear(ctx: HubConnectionContext): boolean {
  const inboundDomestic = isDomesticUs(ctx.inbound.departureAirport ?? "");
  const outboundIntl = !isDomesticUs(ctx.outbound.arrivalAirport ?? "");
  return inboundDomestic && outboundIntl;
}

/** Schematic walk minutes between gates at SEA when layout + gates allow routing. */
export function estimateSeaConnectionWalkMinutes(input: {
  arrivalGate: string | null;
  departureGate: string | null;
  arrivalTerminal?: string | null;
  departureTerminal?: string | null;
  throughSecurity?: boolean;
  credentials?: { tsaPreCheck?: boolean; clear?: boolean };
}): { minutes: number | null; known: boolean } {
  const layout = getAirportLayout("SEA");
  const creds = {
    tsaPreCheck: Boolean(input.credentials?.tsaPreCheck),
    clear: Boolean(input.credentials?.clear),
    known: true,
  };

  if (layout && input.arrivalGate?.trim() && input.departureGate?.trim()) {
    const fromGate = resolveGateNode(layout, input.arrivalGate);
    const toGate = resolveGateNode(layout, input.departureGate);
    if (fromGate && toGate) {
      const fromPoi = layout.pois.find((p) => p.nodeId === fromGate.id);
      const toPoi = layout.pois.find((p) => p.nodeId === toGate.id);
      if (fromPoi && toPoi) {
        const route = computeRoute({
          layout,
          fromNodeId: fromGate.id,
          toPoiId: toPoi.id,
          credentials: creds,
        });
        if (route) {
          return { minutes: Math.max(1, Math.round(route.totalSeconds / 60)), known: true };
        }
      }
    }
  }

  const nav = getAirportNav("SEA");
  const arrPrefix = input.arrivalGate?.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();
  const depPrefix = input.departureGate?.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();
  if (nav && arrPrefix && depPrefix) {
    const route = nav.concourseRoutes.find(
      (r) =>
        r.fromZone.toUpperCase() === arrPrefix &&
        r.toZone.toUpperCase() === depPrefix,
    );
    if (route?.totalMinutes) {
      return { minutes: route.totalMinutes, known: true };
    }
  }

  if (
    input.arrivalTerminal?.trim() &&
    input.departureTerminal?.trim() &&
    input.arrivalTerminal.trim() !== input.departureTerminal.trim()
  ) {
    return { minutes: 15, known: false };
  }

  return { minutes: null, known: false };
}

/** Named SEA connection steps — data lives here, not per-airport UI. */
export function buildSeaConnectionSteps(input: {
  ctx: HubConnectionContext;
  walkMinutes: number | null;
  walkKnown: boolean;
  throughSecurity?: boolean;
  credentials?: { tsaPreCheck?: boolean; clear?: boolean };
}): SeaConnectionStep[] {
  const { ctx, walkMinutes, walkKnown } = input;
  const steps: SeaConnectionStep[] = [
    {
      id: "deplane",
      icon: "🛬",
      text: "Deplane — follow Connections signs",
      detail: ctx.bagsCheckedThrough
        ? "Bags are usually checked through on the same ticket"
        : "Confirm on your boarding pass whether bags transfer",
      minutes: DEPLANE_BUFFER_MIN,
    },
  ];

  const arrTerm = ctx.inbound.arrivalTerminal?.trim();
  const depTerm = ctx.outbound.departureTerminal?.trim();
  if (arrTerm && depTerm && arrTerm !== depTerm) {
    steps.push({
      id: "transfer",
      icon: "🚶",
      text: `Terminal ${arrTerm} → Terminal ${depTerm}`,
      detail: "Follow airport signs — allow time for the walk or shuttle",
      minutes: walkKnown ? walkMinutes : null,
    });
  } else if (needsIntlReclear(ctx)) {
    const nav = getAirportNav("SEA");
    steps.push({
      id: "transfer",
      icon: "🚶",
      text: "Walk to international departures",
      detail: nav?.connectingFlight ?? "Follow signs to international TSA",
      minutes: walkKnown ? walkMinutes : null,
    });
  } else if (walkKnown && walkMinutes != null) {
    steps.push({
      id: "transfer",
      icon: "🚶",
      text: "Walk to your connecting gate area",
      detail: "Follow gate boards — connection time includes the walk",
      minutes: walkMinutes,
    });
  }

  if (needsIntlReclear(ctx)) {
    const precheck = Boolean(input.credentials?.tsaPreCheck || input.credentials?.clear);
    steps.push({
      id: "security",
      icon: "🛡",
      text: "International TSA — re-clear security",
      detail: precheck
        ? "TSA PreCheck or CLEAR — follow checkpoint signs to international"
        : "Allow time for standard screening before your international gate",
      minutes: precheck ? TSA_INTL_RECLEAR_PRECHECK_MIN : TSA_INTL_RECLEAR_MIN,
    });
  }

  const gateLabel = ctx.outbound.departureGate?.trim();
  steps.push({
    id: "gate",
    icon: "🚪",
    text: gateLabel
      ? `Board ${ctx.outbound.flightNumber ?? "your flight"} — gate posted`
      : `Board ${ctx.outbound.flightNumber ?? "your connecting flight"}`,
    detail: gateLabel
      ? `Gate ${gateLabel} — confirm on airport boards`
      : "Gate not assigned yet — check boards after security",
    minutes: walkKnown && !needsIntlReclear(ctx) ? walkMinutes : null,
  });

  return steps;
}

function totalRequiredMinutes(
  steps: readonly SeaConnectionStep[],
  walkKnown: boolean,
): { total: number; honestyParts: string[] } {
  let total = 0;
  const honestyParts: string[] = [];
  for (const step of steps) {
    if (step.minutes != null && Number.isFinite(step.minutes)) {
      total += step.minutes;
    } else if (step.id === "transfer" || step.id === "gate") {
      total += walkKnown ? UNKNOWN_WALK_ESTIMATE_MIN : UNKNOWN_WALK_BUFFER_MIN;
      honestyParts.push("walk time unknown");
    }
  }
  return { total, honestyParts };
}

function resolveConnectionState(spareMinutes: number): ConnectionCoachState {
  if (spareMinutes >= 15) return "fine";
  if (spareMinutes >= 5) return "tight";
  if (spareMinutes >= 0) return "go_now";
  if (spareMinutes >= -10) return "miss";
  return "recover";
}

function clockLabelForConnectionState(
  state: ConnectionCoachState,
  spareMinutes: number,
): string {
  switch (state) {
    case "fine":
      return `${Math.max(1, Math.round(spareMinutes))} min to spare`;
    case "tight":
      return "tight connection";
    case "go_now":
      return "go now";
    case "miss":
      return "may miss — hurry";
    case "recover":
      return "missed — talk to airline";
    default:
      return "check timing";
  }
}

function formatLeaveByClock(leaveUtcMs: number, timezone?: string): string {
  if (!Number.isFinite(leaveUtcMs)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(leaveUtcMs));
}

function resolveConnectionNextMove(
  hubIata: string,
  step: ConnectionPlaybookStep | SeaConnectionStep | null,
): { move: string; detail?: string } {
  if (!step) {
    return {
      move: "Follow Connections signs",
      detail: hubIata === "SEA" ? "International departures may require TSA again" : undefined,
    };
  }
  return { move: step.text, detail: step.detail };
}

export interface ConnectionGateConfidenceInput {
  ctx: HubConnectionContext;
  minutesToOutboundDeparture: number;
  landedMinutesAgo?: number | null;
  locationStatus?: string;
  throughSecurity?: boolean;
  credentials?: { tsaPreCheck?: boolean; clear?: boolean };
  walkMinutes?: number | null;
  walkKnown?: boolean;
  nowMs?: number;
}

/** Make/miss connection clock — honest buffers, no invented gates. */
export function computeConnectionGateConfidence(
  input: ConnectionGateConfidenceInput,
): GateConfidenceResult {
  const nowMs = input.nowMs ?? Date.now();
  const { ctx } = input;
  const hub = ctx.hubIata;

  const walk =
    input.walkMinutes !== undefined
      ? { minutes: input.walkMinutes, known: input.walkKnown ?? input.walkMinutes != null }
      : estimateSeaConnectionWalkMinutes({
          arrivalGate: ctx.inbound.arrivalGate,
          departureGate: ctx.outbound.departureGate,
          arrivalTerminal: ctx.inbound.arrivalTerminal,
          departureTerminal: ctx.outbound.departureTerminal,
          throughSecurity: input.throughSecurity,
          credentials: input.credentials,
        });

  const seaSteps = hub === "SEA" ? buildSeaConnectionSteps({
    ctx,
    walkMinutes: walk.minutes,
    walkKnown: walk.known,
    throughSecurity: input.throughSecurity,
    credentials: input.credentials,
  }) : [];

  const connIdx = resolveConnectionSpotlightIndex(ctx.playbook, {
    locationStatus: input.locationStatus,
    minutesSinceLanding: input.landedMinutesAgo,
  });
  const playbookStep = ctx.playbook.steps[connIdx] ?? ctx.playbook.steps[0] ?? null;
  const seaStep = seaSteps.find((s) => s.id === playbookStep?.id) ?? seaSteps[0] ?? null;
  const next = resolveConnectionNextMove(hub, seaStep ?? playbookStep);

  const { total: requiredMin, honestyParts } = totalRequiredMinutes(
    seaSteps.length > 0 ? seaSteps : [{ id: "deplane", icon: "🛬", text: "", minutes: DEPLANE_BUFFER_MIN }],
    walk.known,
  );

  const outboundBoardingCloseMs =
    ctx.outbound.departureUtcMs - DEFAULT_BOARDING_CLOSE_LEAD_MIN * 60_000;
  const minutesToOutboundBoardingClose = (outboundBoardingCloseMs - nowMs) / 60_000;

  // Far from outbound — show leave-by for international depart, never 4-digit min early.
  if (input.minutesToOutboundDeparture > TRAVEL_DAY_PRESSURE_WINDOW_MIN) {
    const tz = timezoneForIata(hub);
    const leaveUtcMs =
      ctx.inbound.arrivalUtcMs + requiredMin * 60_000 + CONNECTION_SLACK_MIN * 60_000;
    const leaveClock = formatLeaveByClock(leaveUtcMs, tz);
    const honestyNote = !walk.known
      ? "Walk time unknown — using a wider buffer. Follow posted signs."
      : honestyParts.length > 0
        ? `${honestyParts.join("; ")} — wider buffer applied.`
        : undefined;

    return {
      state: "fine",
      clockLabel: leaveClock ? `make connection by ${leaveClock}` : "connection planned",
      nextMove: next.move,
      nextMoveDetail: next.detail,
      spareMinutes: null,
      honestyNote,
      cta: { label: "Show map", kind: "show_map" },
    };
  }

  let spareMinutes: number;
  const landed = input.landedMinutesAgo != null && input.landedMinutesAgo >= 0;

  if (landed) {
    const elapsedSinceLanding = input.landedMinutesAgo!;
    const remainingIdx = seaSteps.findIndex((s) => s.id === (seaStep?.id ?? "deplane"));
    const remainingSteps = remainingIdx >= 0 ? seaSteps.slice(remainingIdx) : seaSteps;
    const remainingRequired = totalRequiredMinutes(remainingSteps, walk.known).total;
    spareMinutes = clampSpare(minutesToOutboundBoardingClose - remainingRequired - CONNECTION_SLACK_MIN);
  } else {
    const inboundArrivalMinFromNow = (ctx.inbound.arrivalUtcMs - nowMs) / 60_000;
    const windowMin =
      minutesToOutboundBoardingClose - Math.max(0, inboundArrivalMinFromNow) - requiredMin - CONNECTION_SLACK_MIN;
    spareMinutes = clampSpare(windowMin);
  }

  const state = resolveConnectionState(spareMinutes);
  const honestyNote = !walk.known
    ? "Walk time unknown — using a wider buffer. Follow posted signs."
    : ctx.inbound.delayMinutes > 0
      ? `Inbound +${ctx.inbound.delayMinutes}m — connection time updated.`
      : honestyParts.length > 0
        ? `${honestyParts.join("; ")} — wider buffer applied.`
        : undefined;

  const recoverHint =
    state === "recover"
      ? "missed — talk to Alaska at a gate agent"
      : state === "miss"
        ? "may miss — don't leave sterile area if still possible"
        : undefined;

  const airlineHint = (ctx.outbound.airline ?? "").toLowerCase();
  const cta =
    state === "recover" || state === "miss"
      ? {
          label: airlineHint.includes("alaska") ? "Find Alaska agent" : "Talk to your airline",
          kind: "none" as const,
        }
      : { label: "Show map", kind: "show_map" as const };

  return {
    state,
    clockLabel: clockLabelForConnectionState(state, spareMinutes),
    nextMove: next.move,
    nextMoveDetail:
      state === "recover"
        ? "See a gate agent before leaving the secure area — they may rebook you."
        : state === "miss"
          ? recoverHint ?? next.detail
          : next.detail,
    spareMinutes,
    honestyNote,
    cta,
  };
}
