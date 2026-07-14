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

export function buildTripJourney(
  layout: AirportLayout,
  ctx: TripJourneyContext,
): JourneyStop[] {
  const nodes = nodeById(layout);
  const airline = ctx.airlineName?.trim().toLowerCase() || null;
  const stops: JourneyStop[] = [];

  // 1) Drop-off / entrance — landside. Prefer an explicit curb/entrance node.
  const dropoff =
    layout.nodes.find(
      (node) => !node.airside && /drop|curb|entrance|departure/i.test(node.landmark ?? ""),
    ) ??
    layout.nodes.find((node) => node.kind === "junction" && !node.airside) ??
    layout.nodes.find((node) => !node.airside);
  if (dropoff) {
    stops.push({
      role: "dropoff",
      nodeId: dropoff.id,
      label: "Get dropped off",
      detail: dropoff.landmark,
      known: true,
    });
  }

  // 2) Check-in — the traveler's airline if we can match it, else generic.
  if (ctx.includeCheckin !== false) {
    const checkins = layout.pois.filter((poi) => poi.category === "checkin");
    let checkin: PoiDefinition | undefined;
    if (airline) {
      checkin = checkins.find(
        (poi) => poi.airline && airline.includes(poi.airline.toLowerCase()),
      );
    }
    if (!checkin) checkin = checkins.find((poi) => !poi.airline) ?? checkins[0];
    if (checkin) {
      stops.push({
        role: "checkin",
        nodeId: checkin.nodeId,
        poiId: checkin.id,
        label: checkin.name,
        known: true,
      });
    }
  }

  // Resolve the gate early — used to pick the closest security checkpoint.
  const gateNodeId = ctx.gateCode ? resolveGateNode(layout, ctx.gateCode) : null;

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

/** POI ids that are part of the journey — used to emphasise vs. fade markers. */
export function journeyPoiIds(stops: JourneyStop[]): Set<string> {
  return new Set(stops.map((stop) => stop.poiId).filter((id): id is string => Boolean(id)));
}
