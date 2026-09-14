/**
 * FCO Gospel Connection Walk — invent=0 (G65).
 * Coach nodes = official airport procedure text (getAirportNav) ∪ signed FCO package nodes only.
 * Never Flighty-style predicted gates; missing gate = "Unknown".
 */

import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { computeRoute, resolveGateNode } from "@/lib/airportNav/pathfinder";
import type { HubConnectionContext, HubConnectionLeg } from "@/lib/airportNav/connectionClock";
import { resolveAirport } from "@/lib/airports/lookup";
import { timezoneForIata } from "@/lib/airports/lookup";
import { isInternationalArrivalFlight } from "@/lib/travelAssistant/airportDayCoach";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import type { ConnectionPlaybook, ConnectionPlaybookStep } from "@/lib/travelAssistant/connectionPlaybook";
import {
  pickGateStringFromSources,
  type GateStringSources,
} from "@/lib/travelAssistant/gateStringPath";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { toUtcMs } from "@/lib/travelAssistant/journeyPhase";

export interface GospelConnectionStep extends ConnectionPlaybookStep {
  /** package:poi-passport-t3 | official:customsTip | package:FCO:node:gate:E12 */
  provenance: string;
  minutes?: number | null;
}

const UNKNOWN_GATE_LABEL = "Outbound gate — Unknown";

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

/** Minimal hub context for gospel walk — no playbook dependency (avoids circular imports). */
export function buildFcoHubConnectionContext(
  inboundRes: TransportRouteReservation,
  outboundRes: TransportRouteReservation,
  hubIata: string,
): HubConnectionContext | null {
  const inbound = reservationToLeg(inboundRes, "inbound");
  const outbound = reservationToLeg(outboundRes, "outbound");
  if (!inbound || !outbound) return null;
  if (outbound.departureUtcMs <= inbound.arrivalUtcMs) return null;

  const inboundCode = inboundRes.confirmationCode?.trim();
  const outboundCode = outboundRes.confirmationCode?.trim();
  const bagsCheckedThrough = Boolean(inboundCode && inboundCode === outboundCode);
  const placeholderPlaybook: ConnectionPlaybook = {
    hubIata: hubIata.trim().toUpperCase(),
    inboundFlight: inboundRes.flightNumber ?? null,
    outboundFlight: outboundRes.flightNumber ?? null,
    risk: "normal",
    gapMinutes: (outbound.departureUtcMs - inbound.arrivalUtcMs) / 60_000,
    steps: [],
    issueLine: null,
  };

  return {
    hubIata: hubIata.trim().toUpperCase(),
    inbound,
    outbound,
    playbook: placeholderPlaybook,
    bagsCheckedThrough,
  };
}

function isDomesticFlight(depIata: string, arrIata: string): boolean {
  const dep = resolveAirport(depIata);
  const arr = resolveAirport(arrIata);
  if (!dep?.country || !arr?.country) return false;
  return dep.country.toUpperCase() === arr.country.toUpperCase();
}

function officialFcoPassportDetail(): string | undefined {
  const tip = getAirportNav("FCO")?.arrivalInfo?.customsTip?.trim();
  return tip || undefined;
}

function officialFcoDeplaneDetail(): string | undefined {
  const nav = getAirportNav("FCO");
  const note = nav?.securityNotes?.[0]?.instruction?.trim();
  if (note) return note;
  return nav?.generalNotes?.trim() || undefined;
}

function officialFcoTransferDetail(
  arrivalTerminal: string | null,
  departureTerminal: string | null,
): string | undefined {
  const nav = getAirportNav("FCO");
  if (arrivalTerminal && departureTerminal && arrivalTerminal !== departureTerminal) {
    const from = `T${arrivalTerminal.replace(/^T/i, "")}`;
    const to = `T${departureTerminal.replace(/^T/i, "")}`;
    const route = nav?.concourseRoutes.find(
      (r) => r.fromZone.toUpperCase() === from.toUpperCase() && r.toZone.toUpperCase() === to.toUpperCase(),
    );
    if (route?.steps[0]?.instruction) {
      return route.steps.map((s) => s.instruction).join(" · ");
    }
  }
  return nav?.generalNotes?.trim() || "Follow Connecting Flights / Transiti signs and gate boards.";
}

function resolveOutboundGateStep(
  ctx: HubConnectionContext,
  gateSources: GateStringSources,
): GospelConnectionStep {
  const layout = getAirportLayout("FCO");
  const picked = pickGateStringFromSources({
    ...gateSources,
    bookedGate: gateSources.bookedGate ?? ctx.outbound.departureGate,
    departureIata: "FCO",
  });

  if (!picked.gateString) {
    return {
      id: "gate",
      icon: "🚪",
      text: UNKNOWN_GATE_LABEL,
      detail: "Gate not on your confirmation — check airport departure boards after you reach the gate area.",
      provenance: "official:unknown-gate",
    };
  }

  const mapNodeId = layout ? resolveGateNode(layout, picked.gateString) : null;
  const gatePoi = mapNodeId
    ? layout?.pois.find((poi) => poi.category === "gate" && poi.nodeId === mapNodeId)
    : undefined;

  if (mapNodeId && gatePoi) {
    return {
      id: "gate",
      icon: "🚪",
      text: `Gate ${picked.gateString.toUpperCase()} · ${ctx.outbound.flightNumber ?? "next flight"}`,
      detail: gatePoi.notes ?? gatePoi.name ?? `Boarding area from signed FCO package (${mapNodeId}).`,
      provenance: `package:${mapNodeId}`,
    };
  }

  return {
    id: "gate",
    icon: "🚪",
    text: `Gate ${picked.gateString.toUpperCase()} · ${ctx.outbound.flightNumber ?? "next flight"}`,
    detail: "Confirm on airport departure boards — gate string is not joined to the signed terminal graph yet.",
    provenance: `official:gate-string:${picked.provenance}`,
  };
}

/** Schematic walk minutes when both gates join the signed FCO package graph. */
export function estimateFcoConnectionWalkMinutes(input: {
  arrivalGate: string | null;
  departureGate: string | null;
}): { minutes: number | null; known: boolean } {
  const layout = getAirportLayout("FCO");
  if (!layout || !input.arrivalGate?.trim() || !input.departureGate?.trim()) {
    return { minutes: null, known: false };
  }
  const fromNodeId = resolveGateNode(layout, input.arrivalGate);
  const toNodeId = resolveGateNode(layout, input.departureGate);
  if (!fromNodeId || !toNodeId) return { minutes: null, known: false };

  const toPoi = layout.pois.find((poi) => poi.nodeId === toNodeId);
  if (!toPoi) return { minutes: null, known: false };

  const route = computeRoute({
    layout,
    fromNodeId,
    toPoiId: toPoi.id,
    credentials: { tsaPreCheck: false, clear: false, known: true },
  });
  if (!route) return { minutes: null, known: false };
  return { minutes: Math.max(1, Math.round(route.totalSeconds / 60)), known: true };
}

/** Ordered gospel nodes for an active FCO hub connection — package + official text only. */
export function buildFcoGospelConnectionWalk(input: {
  ctx: HubConnectionContext;
  gateSources?: GateStringSources;
  walkMinutes?: number | null;
  walkKnown?: boolean;
}): GospelConnectionStep[] {
  const { ctx } = input;
  const layout = getAirportLayout("FCO");
  const nav = getAirportNav("FCO");
  const inboundDep = ctx.inbound.departureAirport?.trim().toUpperCase() ?? "";
  const hub = ctx.hubIata.trim().toUpperCase();
  const outboundArr = ctx.outbound.arrivalAirport?.trim().toUpperCase() ?? "";

  const intlInbound = isInternationalArrivalFlight(inboundDep, hub);
  const intlOutbound = !isDomesticFlight(hub, outboundArr) && outboundArr.length === 3;
  const samePnr = ctx.bagsCheckedThrough;

  const steps: GospelConnectionStep[] = [
    {
      id: "deplane",
      icon: "🛬",
      text: "Leave aircraft → follow Connections / Transiti signs",
      detail: ctx.bagsCheckedThrough
        ? `${officialFcoDeplaneDetail() ?? "T1, T2, and T3 are connected — stay airside when bags are checked through."} Same ticket — bags usually transfer.`
        : officialFcoDeplaneDetail() ??
          "Confirm on your boarding pass whether bags transfer before you leave airside.",
      provenance: "official:securityNotes",
      minutes: 10,
    },
  ];

  const passportPoi = layout?.pois.find((poi) => poi.id === "poi-passport-t3");
  if (intlInbound && passportPoi) {
    const passportDetail = officialFcoPassportDetail();
    steps.push({
      id: "immigration",
      icon: "🛂",
      text: passportPoi.name || "Passport control",
      detail:
        passportDetail ??
        passportPoi.notes ??
        "Have passport ready for passport control — pin is schematic between arrivals and baggage.",
      provenance: passportDetail
        ? "package:poi-passport-t3+official:customsTip"
        : "package:poi-passport-t3",
    });
  }

  if (intlInbound || !samePnr) {
    const baggagePoi = layout?.pois.find((poi) => poi.id === "poi-baggage-t3");
    const baggageNote =
      nav?.arrivalInfo?.baggageCarousels?.[0]?.carouselNote?.trim() ?? baggagePoi?.notes;
    steps.push({
      id: "bags",
      icon: "🧳",
      text: samePnr ? "Confirm bags are checked through" : "Claim and re-check bags",
      detail: samePnr
        ? `${baggageNote ?? "Same ticket — bags usually transfer; confirm on the baggage tag."}`
        : baggageNote ??
          "Separate tickets — collect bags and re-check before security.",
      provenance: baggagePoi ? "package:poi-baggage-t3" : "official:baggageCarousels",
    });
  }

  const arrTerm = ctx.inbound.arrivalTerminal?.trim() ?? null;
  const depTerm = ctx.outbound.departureTerminal?.trim() ?? null;
  const needsSecurity =
    intlInbound || !samePnr || (intlOutbound && !intlInbound) || Boolean(arrTerm && depTerm && arrTerm !== depTerm);

  if (needsSecurity) {
    const securityPoi = layout?.pois.find((poi) => poi.category === "security");
    const securityNote = nav?.securityNotes?.[0]?.instruction?.trim();
    steps.push({
      id: "security",
      icon: "🛡",
      text: intlOutbound && !intlInbound ? "Security screening — international departure" : "Security screening again",
      detail:
        securityPoi?.notes ??
        securityNote ??
        "Allow time for the checkpoint — follow airport signs.",
      provenance: securityPoi ? `package:${securityPoi.id}` : "official:securityNotes",
      minutes: 15,
    });
  }

  const walkKnown = input.walkKnown ?? false;
  const walkMinutes = input.walkMinutes ?? null;
  if (arrTerm && depTerm && arrTerm !== depTerm) {
    steps.push({
      id: "transfer",
      icon: "🚶",
      text: `Transfer Terminal ${arrTerm} → Terminal ${depTerm}`,
      detail: officialFcoTransferDetail(arrTerm, depTerm),
      provenance: "official:concourseRoutes",
      minutes: walkKnown ? walkMinutes : null,
    });
  } else {
    steps.push({
      id: "transfer",
      icon: "🚶",
      text: "Walk to your departure gate area",
      detail: officialFcoTransferDetail(arrTerm, depTerm),
      provenance: "official:generalNotes",
      minutes: walkKnown ? walkMinutes : null,
    });
  }

  steps.push(
    resolveOutboundGateStep(ctx, input.gateSources ?? { departureIata: "FCO" }),
  );

  return steps;
}

export function gospelStepsToPlaybookSteps(steps: readonly GospelConnectionStep[]): ConnectionPlaybookStep[] {
  return steps.map(({ id, icon, text, detail }) => ({ id, icon, text, detail }));
}

/** True when signed FCO package has enough nodes for a gospel connection walk. */
export function fcoPackageSupportsGospelConnectionWalk(): boolean {
  const layout = getAirportLayout("FCO");
  if (!layout) return false;
  return (
    layout.pois.some((poi) => poi.id === "poi-passport-t3") &&
    layout.nodes.some((node) => node.kind === "gate") &&
    layout.zones.some((zone) => zone.id === "FCO:zone:t3")
  );
}
