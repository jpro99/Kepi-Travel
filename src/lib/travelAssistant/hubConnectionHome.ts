/**
 * G65 — Hub connection crisis on Home: gate + steps when changing planes,
 * not "Landing plan — VCE" while you're still racing for a gate at FCO.
 */

import {
  isHubConnectionActive,
  resolveHubConnection,
  type HubConnectionContext,
} from "@/lib/airportNav/connectionClock";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import {
  buildConnectionPlaybook,
  connectionPlaybookForFlight,
  connectionRiskLabel,
  resolveConnectionSpotlightIndex,
  type ConnectionPlaybook,
  type ConnectionPlaybookStep,
} from "@/lib/travelAssistant/connectionPlaybook";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

const MS_PER_MIN = 60_000;

export interface HomeHubConnectionSurface {
  hubIata: string;
  outboundReservationId: string;
  playbook: ConnectionPlaybook;
  currentStep: ConnectionPlaybookStep;
  currentStepIndex: number;
  outboundDepartureUtcMs: number;
  outboundGate: string | null;
  outboundFlightNumber: string | null;
  minutesToOutboundDeparture: number;
  /** True when still on the ground at the hub (before wheels-up on outbound). */
  onGroundAtHub: boolean;
  ctx: HubConnectionContext;
}

function candidateOutboundIds(
  reservations: readonly TransportRouteReservation[],
  journeyPhase: JourneyPhase | null | undefined,
): string[] {
  const ids = new Set<string>();
  if (journeyPhase?.kind === "airborne") {
    ids.add(journeyPhase.onFlight.id);
  }
  if (journeyPhase?.kind === "just-landed") {
    const landedAt = journeyPhase.flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
    for (const row of reservations) {
      if ((row.type ?? "").toLowerCase() !== "flight") continue;
      const dep = row.flightDepartureAirport?.trim().toUpperCase() ?? "";
      if (dep && dep === landedAt) ids.add(row.id);
    }
  }
  if (journeyPhase?.kind === "pre-trip") {
    ids.add(journeyPhase.nextFlight.id);
  }
  const nowMs = Date.now();
  for (const row of reservations) {
    if ((row.type ?? "").toLowerCase() !== "flight") continue;
    const depMs = flightDepartureUtcMs(row);
    if (!Number.isFinite(depMs)) continue;
    if (depMs >= nowMs - 2 * MS_PER_MIN && depMs <= nowMs + 8 * 60 * MS_PER_MIN) {
      ids.add(row.id);
    }
  }
  return [...ids];
}

function landedMinutesAgo(journeyPhase: JourneyPhase | null | undefined): number | null {
  if (journeyPhase?.kind !== "just-landed") return null;
  return journeyPhase.landedMinutesAgo;
}

function travelerAtHub(
  hubIata: string,
  locationStatus: string | undefined,
  nearestAirport: string | null | undefined,
): boolean {
  const hub = hubIata.trim().toUpperCase();
  if (!hub) return false;
  if (nearestAirport?.trim().toUpperCase() === hub) return true;
  return locationStatus === "at-airport" || locationStatus === "in-terminal";
}

/**
 * Active same-airport connection the Home hero should lead with.
 * Prefers tight connections and GPS at the hub.
 */
export function resolveHomeHubConnectionSurface(input: {
  reservations: readonly TransportRouteReservation[];
  journeyPhase?: JourneyPhase | null;
  locationStatus?: string;
  nearestAirport?: string | null;
  liveDepartureGate?: string | null;
  nowMs?: number;
}): HomeHubConnectionSurface | null {
  const nowMs = input.nowMs ?? Date.now();
  const reservations = [...input.reservations];
  const outboundIds = candidateOutboundIds(reservations, input.journeyPhase);

  let best: HomeHubConnectionSurface | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const outboundId of outboundIds) {
    const outboundRes = reservations.find((r) => r.id === outboundId);
    const hub = outboundRes?.flightDepartureAirport?.trim().toUpperCase() ?? "";
    if (!hub) continue;

    const ctx = resolveHubConnection(reservations, hub, outboundId, nowMs);
    if (!ctx || !isHubConnectionActive(ctx, nowMs)) continue;

    const playbook =
      ctx.playbook ??
      connectionPlaybookForFlight(reservations, outboundId, nowMs) ??
      buildConnectionPlaybook(reservations, nowMs, { requireActiveWindow: false });
    if (!playbook || playbook.hubIata !== hub) continue;

    const minutesToDep = (ctx.outbound.departureUtcMs - nowMs) / MS_PER_MIN;
    const onGroundAtHub =
      nowMs < ctx.outbound.departureUtcMs - 3 * MS_PER_MIN ||
      travelerAtHub(hub, input.locationStatus, input.nearestAirport);

    // After outbound wheels-up, connection coach is done — landing plan owns the hero.
    if (!onGroundAtHub && input.journeyPhase?.kind === "airborne") continue;

    const stepIndex = resolveConnectionSpotlightIndex(playbook, {
      locationStatus: input.locationStatus,
      minutesSinceLanding: landedMinutesAgo(input.journeyPhase),
    });
    const currentStep = playbook.steps[stepIndex] ?? playbook.steps[0];
    if (!currentStep) continue;

    const gate =
      input.liveDepartureGate?.trim() ||
      ctx.outbound.departureGate?.trim() ||
      outboundRes?.flightDepartureGate?.trim() ||
      null;

    const riskWeight =
      playbook.risk === "impossible"
        ? 400
        : playbook.risk === "tight"
          ? 300
          : playbook.risk === "normal"
            ? 100
            : 0;
    const atHubWeight = travelerAtHub(hub, input.locationStatus, input.nearestAirport) ? 200 : 0;
    const urgencyWeight = minutesToDep > 0 && minutesToDep < 90 ? 150 - minutesToDep : 0;
    const score = riskWeight + atHubWeight + urgencyWeight;

    if (score <= bestScore) continue;
    bestScore = score;
    best = {
      hubIata: hub,
      outboundReservationId: outboundId,
      playbook,
      currentStep,
      currentStepIndex: stepIndex,
      outboundDepartureUtcMs: ctx.outbound.departureUtcMs,
      outboundGate: gate,
      outboundFlightNumber: ctx.outbound.flightNumber ?? outboundRes?.flightNumber ?? null,
      minutesToOutboundDeparture: minutesToDep,
      onGroundAtHub,
      ctx,
    };
  }

  return best;
}

export function formatHubConnectionHeroTitle(surface: HomeHubConnectionSurface): string {
  if (surface.outboundGate) {
    return `Gate ${surface.outboundGate}`;
  }
  return surface.currentStep.text;
}

export function formatHubConnectionHeroDetail(surface: HomeHubConnectionSurface): string {
  const parts: string[] = [];
  const fn = surface.outboundFlightNumber?.trim();
  if (fn) parts.push(fn);
  parts.push(`${surface.hubIata} → ${surface.ctx.outbound.arrivalAirport ?? "next flight"}`);
  if (surface.minutesToOutboundDeparture > 0 && surface.minutesToOutboundDeparture < 180) {
    const mins = Math.round(surface.minutesToOutboundDeparture);
    parts.push(`Departs in ${mins} min`);
  } else if (surface.currentStep.detail) {
    parts.push(surface.currentStep.detail);
  }
  return parts.filter(Boolean).join(" · ");
}

export function hubConnectionEyebrow(surface: HomeHubConnectionSurface): string {
  if (surface.playbook.risk === "tight" || surface.playbook.risk === "impossible") {
    return connectionRiskLabel(surface.playbook.risk);
  }
  if (surface.onGroundAtHub) {
    return `Connection at ${surface.hubIata}`;
  }
  return `At ${surface.hubIata}`;
}
