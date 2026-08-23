/**
 * Trip-focused airport journey.
 *
 * Turns a generic airport layout + this traveler's flight context into the
 * short, ordered list of stops that actually matter to them:
 *
 *   drop-off → check-in (their airline) → security → (lounge) → their gate
 *
 * This is the replicable product layer: it is airport-agnostic (works off any
 * AirportLayout, however it was sourced — hand-curated or OSM-imported), so the
 * map can highlight the traveler's path and fade everything else to reference.
 * Other gates/POIs are never removed — they stay as faint reference — but only
 * the journey is emphasised so nobody has to guess what to do next.
 *
 * The gate is only a firm stop once it is assigned; before that it is a
 * `known:false` placeholder ("assigned soon") and the concourses stay as
 * reference, per owner intent.
 */

import type { AirportLayout, GraphNode, PoiDefinition } from "./types";
import { resolveGateNode } from "./pathfinder";

export type JourneyRole = "dropoff" | "checkin" | "security" | "lounge" | "gate";

/** Arrival-first-mile roles — gate → passport → bags → customs → ground transport. */
export type ArrivalJourneyRole =
  | "deplane"
  | "passport"
  | "baggage"
  | "customs"
  | "exit"
  | "ground_transport";

export interface JourneyStop {
  role: JourneyRole;
  /** Graph node for this stop. Empty string when the stop is not yet known. */
  nodeId: string;
  /** POI backing this stop (used for routing + marker emphasis), if any. */
  poiId?: string;
  label: string;
  detail?: string;
  /** false = placeholder the UI should show as pending (e.g. gate not assigned). */
  known: boolean;
}

export interface TripJourneyContext {
  airlineName?: string | null;
  gateCode?: string | null;
  eligibleLoungeNames?: string[];
  /** Skip the check-in stop (e.g. traveler has no bags / already checked in). */
  includeCheckin?: boolean;
  /** Skip the lounge detour even when eligible. */
  includeLounge?: boolean;
}

function nodeById(layout: AirportLayout): Map<string, GraphNode> {
  return new Map(layout.nodes.map((node) => [node.id, node]));
}

function planarDist(a: [number, number], b: [number, number]): number {
  const dLng = a[0] - b[0];
  const dLat = a[1] - b[1];
  return dLng * dLng + dLat * dLat;
}

/** Gate cluster id → paired curb id for multi-terminal airports (ONT gate-t2 → curb-t2). */
function curbNodeForGateCluster(gateNodeId: string | null): string | null {
  if (!gateNodeId) return null;
  const match = gateNodeId.match(/^gate-(.+)$/);
  return match ? `curb-${match[1]}` : null;
}

function resolveDeparturesCurbNode(
  layout: AirportLayout,
  opts: { gateNodeId: string | null; checkinNodeId?: string | null },
): GraphNode | undefined {
  const pairedId = curbNodeForGateCluster(opts.gateNodeId);
  if (pairedId) {
    const paired = layout.nodes.find((node) => node.id === pairedId);
    if (paired) return paired;
  }
  if (opts.checkinNodeId) {
    const atCheckin = layout.nodes.find((node) => node.id === opts.checkinNodeId);
    if (atCheckin && /curb|drop|depart/i.test(atCheckin.landmark ?? "")) return atCheckin;
  }
  return (
    layout.nodes.find(
      (node) => !node.airside && /drop|curb|entrance|departure/i.test(node.landmark ?? ""),
    ) ??
    layout.nodes.find((node) => node.kind === "junction" && !node.airside) ??
    layout.nodes.find((node) => !node.airside)
  );
}

function pickNearestPoi(
  pois: PoiDefinition[],
  toNodeId: string | null,
  nodes: Map<string, GraphNode>,
): PoiDefinition | undefined {
  if (pois.length === 0) return undefined;
  const target = toNodeId ? nodes.get(toNodeId)?.pos : undefined;
  if (!target) return pois[0];
  let best = pois[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const poi of pois) {
    const pos = nodes.get(poi.nodeId)?.pos;
    if (!pos) continue;
    const dist = planarDist(pos, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = poi;
    }
  }
  return best;
}

/** Gate cluster id → paired check-in node (ONT gate-t2 → checkin-t2). */
function checkinNodeForGateCluster(gateNodeId: string | null): string | null {
  if (!gateNodeId) return null;
  const match = gateNodeId.match(/^gate-(.+)$/);
  return match ? `checkin-${match[1]}` : null;
}

export function buildTripJourney(
  layout: AirportLayout,
  ctx: TripJourneyContext,
): JourneyStop[] {
  const nodes = nodeById(layout);
  const airline = ctx.airlineName?.trim().toLowerCase() || null;
  const stops: JourneyStop[] = [];

  const gateNodeId = ctx.gateCode ? resolveGateNode(layout, ctx.gateCode) : null;

  // 1) Check-in — terminal paired to gate, then airline counter, else generic.
  let checkin: PoiDefinition | undefined;
  if (ctx.includeCheckin !== false) {
    const checkins = layout.pois.filter(
      (poi) => poi.category === "checkin" && !poi.id.startsWith("poi-dropoff-"),
    );
    const pairedCheckinId = checkinNodeForGateCluster(gateNodeId);
    if (pairedCheckinId) {
      checkin = checkins.find((poi) => poi.nodeId === pairedCheckinId);
    }
    if (!checkin && airline) {
      checkin = checkins.find(
        (poi) => poi.airline && airline.includes(poi.airline.toLowerCase()),
      );
    }
    if (!checkin) checkin = checkins.find((poi) => !poi.airline) ?? checkins[0];
  }

  // 2) Drop-off / curb — terminal-paired when gate/check-in is known (ONT T2/T4).
  const dropoff = resolveDeparturesCurbNode(layout, {
    gateNodeId,
    checkinNodeId: checkin?.nodeId ?? null,
  });
  if (dropoff) {
    const dropoffPoi =
      layout.pois.find(
        (poi) => poi.nodeId === dropoff.id && poi.id.startsWith("poi-dropoff-"),
      ) ??
      (checkin?.nodeId === dropoff.id ? checkin : undefined) ??
      layout.pois.find((poi) => poi.nodeId === dropoff.id);
    stops.push({
      role: "dropoff",
      nodeId: dropoff.id,
      poiId: dropoffPoi?.id,
      label: "Get dropped off",
      detail: dropoff.landmark,
      known: true,
    });
  }

  if (checkin) {
    stops.push({
      role: "checkin",
      nodeId: checkin.nodeId,
      poiId: checkin.id,
      label: checkin.name,
      known: true,
    });
  }

  // 3) Security — the checkpoint closest to where they're headed.
  const securities = layout.pois.filter((poi) => poi.category === "security");
  const security = pickNearestPoi(
    securities,
    gateNodeId ?? stops.find((stop) => stop.role === "checkin")?.nodeId ?? null,
    nodes,
  );
  if (security) {
    stops.push({
      role: "security",
      nodeId: security.nodeId,
      poiId: security.id,
      label: "Security",
      detail: security.name,
      known: true,
    });
  }

  // 4) Lounge — only when the traveler can actually get in.
  const eligible = (ctx.eligibleLoungeNames ?? []).map((name) => name.trim().toLowerCase());
  if (ctx.includeLounge !== false && eligible.length > 0) {
    const lounges = layout.pois.filter((poi) => poi.category === "lounge");
    let lounge = lounges.find((poi) => {
      const name = poi.name.toLowerCase();
      return eligible.some((entry) => name.includes(entry) || entry.includes(name));
    });
    if (!lounge && airline) {
      lounge = lounges.find(
        (poi) => poi.airline && airline.includes(poi.airline.toLowerCase()),
      );
    }
    // If the gate is known, prefer the eligible lounge nearest the gate.
    if (lounge && gateNodeId) {
      const sameName = lounges.filter((poi) =>
        eligible.some((entry) => poi.name.toLowerCase().includes(entry)),
      );
      lounge = pickNearestPoi(sameName.length > 0 ? sameName : [lounge], gateNodeId, nodes) ?? lounge;
    }
    if (lounge) {
      stops.push({
        role: "lounge",
        nodeId: lounge.nodeId,
        poiId: lounge.id,
        label: lounge.name,
        known: true,
      });
    }
  }

  // 5) Gate — firm stop once assigned; otherwise a pending placeholder.
  if (gateNodeId) {
    const gatePoi = layout.pois.find(
      (poi) => poi.category === "gate" && poi.nodeId === gateNodeId,
    );
    stops.push({
      role: "gate",
      nodeId: gateNodeId,
      poiId: gatePoi?.id,
      label: `Gate ${ctx.gateCode!.trim().toUpperCase()}`,
      detail: gatePoi?.name,
      known: true,
    });
  } else {
    stops.push({
      role: "gate",
      nodeId: "",
      label: "Gate — assigned soon",
      detail: "Highlights here once your gate posts",
      known: false,
    });
  }

  return stops;
}

export interface ArrivalJourneyStop {
  role: ArrivalJourneyRole;
  nodeId: string;
  poiId?: string;
  label: string;
  detail?: string;
  known: boolean;
}

export interface ArrivalJourneyContext {
  gateCode?: string | null;
  /** When false, skip passport (domestic / Schengen-only). */
  includePassport?: boolean;
  /** When false, skip customs (domestic). */
  includeCustoms?: boolean;
  /** Include Leonardo / train POI when layout has one. */
  includeGroundTransport?: boolean;
}

/** True when a bundled layout has schematic arrival nodes for map + coach wiring. */
export function layoutSupportsArrivalFirstMile(layout: AirportLayout): boolean {
  const hasBaggage = layout.nodes.some((node) => node.kind === "baggage_claim");
  const hasPassportOrCustoms = layout.pois.some(
    (poi) =>
      poi.category === "customs" || poi.category === "baggage",
  );
  const hasGround =
    layout.pois.some((poi) => poi.category === "train") ||
    layout.nodes.some((node) => node.kind === "ground_transport");
  return hasBaggage && hasPassportOrCustoms && hasGround;
}

function resolveArrivalGateNode(layout: AirportLayout, gateCode?: string | null): string | null {
  if (gateCode) {
    const resolved = resolveGateNode(layout, gateCode);
    if (resolved) return resolved;
  }
  const gateNode =
    layout.nodes.find((node) => node.kind === "gate" && node.airside) ??
    layout.nodes.find((node) => node.kind === "gate");
  return gateNode?.id ?? null;
}

/**
 * Arrival path for airports with first-mile graph nodes (FCO T3 pilot).
 * Ordered: deplane → passport → baggage → customs → Leonardo / ground transport.
 */
export function buildArrivalTripJourney(
  layout: AirportLayout,
  ctx: ArrivalJourneyContext = {},
): ArrivalJourneyStop[] {
  if (!layoutSupportsArrivalFirstMile(layout)) return [];

  const stops: ArrivalJourneyStop[] = [];
  const gateNodeId = resolveArrivalGateNode(layout, ctx.gateCode);
  const gatePoi = gateNodeId
    ? layout.pois.find((poi) => poi.category === "gate" && poi.nodeId === gateNodeId)
    : undefined;

  if (gateNodeId) {
    stops.push({
      role: "deplane",
      nodeId: gateNodeId,
      poiId: gatePoi?.id,
      label: ctx.gateCode ? `Gate ${ctx.gateCode.trim().toUpperCase()}` : "Arrivals gate",
      detail: gatePoi?.name,
      known: true,
    });
  }

  const passportPoi = layout.pois.find(
    (poi) => poi.id.includes("passport") || /passport/i.test(poi.name),
  );
  if (ctx.includePassport !== false && passportPoi) {
    stops.push({
      role: "passport",
      nodeId: passportPoi.nodeId,
      poiId: passportPoi.id,
      label: passportPoi.name,
      detail: passportPoi.notes,
      known: true,
    });
  }

  const baggagePoi = layout.pois.find((poi) => poi.category === "baggage");
  if (baggagePoi) {
    stops.push({
      role: "baggage",
      nodeId: baggagePoi.nodeId,
      poiId: baggagePoi.id,
      label: baggagePoi.name,
      detail: baggagePoi.notes,
      known: true,
    });
  }

  const customsPoi = layout.pois.find(
    (poi) => poi.category === "customs" && poi.id !== passportPoi?.id,
  );
  if (ctx.includeCustoms !== false && customsPoi) {
    stops.push({
      role: "customs",
      nodeId: customsPoi.nodeId,
      poiId: customsPoi.id,
      label: customsPoi.name,
      detail: customsPoi.notes,
      known: true,
    });
  }

  const exitNode =
    layout.nodes.find((node) => node.id.startsWith("curb-") && !node.airside) ??
    layout.nodes.find((node) => !node.airside && /arrival|exit/i.test(node.landmark ?? ""));
  if (exitNode) {
    stops.push({
      role: "exit",
      nodeId: exitNode.id,
      label: "Exit to ground transport",
      detail: exitNode.landmark,
      known: true,
    });
  }

  if (ctx.includeGroundTransport !== false) {
    const trainPoi =
      layout.pois.find((poi) => poi.category === "train") ??
      layout.pois.find((poi) => poi.category === "ground_transport" && poi.id.includes("leonardo"));
    if (trainPoi) {
      stops.push({
        role: "ground_transport",
        nodeId: trainPoi.nodeId,
        poiId: trainPoi.id,
        label: trainPoi.name,
        detail: trainPoi.notes,
        known: true,
      });
    }
  }

  return stops;
}

/** POI ids on the arrival journey — for map emphasis. */
export function arrivalJourneyPoiIds(stops: ArrivalJourneyStop[]): Set<string> {
  return new Set(stops.map((stop) => stop.poiId).filter((id): id is string => Boolean(id)));
}

/** POI ids that are part of the journey — used to emphasise vs. fade markers. */
export function journeyPoiIds(stops: JourneyStop[]): Set<string> {
  return new Set(stops.map((stop) => stop.poiId).filter((id): id is string => Boolean(id)));
}

/**
 * The pre-trip / preview slice of the journey: stops up to and including
 * security. Before the traveler is at the airport (and before a gate is
 * assigned) drawing the full airside line all the way to a lounge/gate snakes a
 * long, confusing spike across the terminal; the useful preview is the
 * get-through-the-front-door path (drop-off → check-in → security). See M24.
 */
export function preSecurityJourney(stops: JourneyStop[]): JourneyStop[] {
  const out: JourneyStop[] = [];
  for (const stop of stops) {
    out.push(stop);
    if (stop.role === "security") break;
  }
  return out;
}
