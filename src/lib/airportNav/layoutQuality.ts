/**
 * Generic airport-layout quality audit — the SEA lessons, enforced on EVERY airport.
 *
 * Why this exists (KEPI_DESIGN_LAW M29):
 *  - The OSM importer (osmImport.ts) synthesizes a "star graph to a central hub"
 *    connectivity skeleton. That exact topology caused SEA's shipped bugs:
 *      • routes drawn straight across the tarmac / apron (non-walkable),
 *      • M/W-shaped zigzags that walked travelers "back and forth",
 *      • lounge/gate nodes stranded ~200 m outside the building,
 *      • destinations wired to a hub that no route could actually reach.
 *  - Those were fixed ONE airport at a time in curated data, guarded only by
 *    SEA-specific tests. Any new airport would repeat them.
 *
 * This module turns those mistakes into invariants that run at PUBLISH time
 * (createAirportLayoutPackage) and in a registry-wide build test, so no airport
 * — bundled seed OR OSM-imported draft — can ship with the same class of defect.
 *
 * It deliberately does NOT try to validate coordinate *accuracy*: only real
 * per-airport OSM ground-truth can do that (verify-first, rule 50). Accuracy is
 * enforced per airport by *NodeContainment-style tests. This audit catches the
 * structural/topological failure modes that generalize across all airports.
 */

import type { AirportLayout, TravelerSecurityCredentials } from "./types";
import { computeRoute } from "./pathfinder";

const EARTH_M_PER_DEG_LAT = 111_320;

function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Project each segment onto the direct start→end vector; sum the backward run. */
function backtrackStats(coords: [number, number][]): { ratio: number; backwardM: number } {
  if (coords.length < 2) return { ratio: 0, backwardM: 0 };
  const start = coords[0];
  const end = coords[coords.length - 1];
  const midLat = (start[1] + end[1]) / 2;
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(midLat * (Math.PI / 180));
  const toLocal = (p: [number, number]): [number, number] => [
    (p[0] - start[0]) * mPerDegLng,
    (p[1] - start[1]) * EARTH_M_PER_DEG_LAT,
  ];
  const e = toLocal(end);
  const directLen = Math.hypot(e[0], e[1]);
  if (directLen < 1) return { ratio: 0, backwardM: 0 }; // start ≈ end; nothing to measure
  const ux = e[0] / directLen;
  const uy = e[1] / directLen;
  let backward = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = toLocal(coords[i]);
    const b = toLocal(coords[i + 1]);
    const proj = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy; // signed progress toward dest
    if (proj < 0) backward += -proj;
  }
  return { ratio: backward / directLen, backwardM: backward };
}

/**
 * The traveler's departure origin for audit purposes: the landside drop-off /
 * curb. Falls back sensibly so this works before an airport hand-labels a curb.
 */
export function resolveLandsideOriginNodeId(layout: AirportLayout): string | null {
  const landside = layout.nodes.filter((n) => !n.airside);
  const byLandmark = (re: RegExp) =>
    landside.find((n) => n.landmark && re.test(n.landmark.toLowerCase()))?.id;
  return (
    byLandmark(/curb|drop|depart/) ??
    landside.find((n) => n.kind === "landmark")?.id ??
    landside.find((n) => n.kind === "checkin")?.id ??
    landside[0]?.id ??
    layout.nodes[0]?.id ??
    null
  );
}

/**
 * The landside node a traveler most plausibly STARTS from for a given
 * destination — the nearest curb/check-in. At a multi-terminal airport (LAX)
 * you are dropped at your own terminal, so backtracking must be judged from that
 * terminal's curb, not a single global origin walked around the whole horseshoe.
 * For a single-terminal airport (SEA) this resolves to the one curb, unchanged.
 */
const CURB_LANDMARK = /curb|drop|depart|ticketing|entrance/;

function nearestLandsideOriginNodeId(layout: AirportLayout, destNodeId: string): string | null {
  const dest = layout.nodes.find((n) => n.id === destNodeId);
  if (!dest) return null;
  // Only "curb-like" start points (a drop-off / terminal entry), never an
  // individual check-in counter mid-hall — otherwise the nearest counter to a
  // gate distorts the backtrack measurement.
  const curbLike = layout.nodes.filter(
    (n) =>
      !n.airside &&
      (n.kind === "junction" || n.kind === "landmark") &&
      n.landmark != null &&
      CURB_LANDMARK.test(n.landmark.toLowerCase()),
  );
  const pool = curbLike.length > 0
    ? curbLike
    : layout.nodes.filter((n) => !n.airside && (n.kind === "junction" || n.kind === "landmark"));
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const node of pool) {
    const d = metersBetween(node.pos, dest.pos);
    if (d < bestD) {
      bestD = d;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * Journey-critical destinations: the traveler is actively routed to these
 * (drop-off → check-in → security → lounge → gate). Unreachable = hard error.
 */
const ROUTABLE_DESTINATION_CATEGORIES = new Set(["gate", "lounge", "checkin", "security", "train"]);
/**
 * Contextual pins placed for orientation (food, restrooms, play areas). They may
 * be intentionally display-only, so an unreachable one is a warning, not a
 * ship-blocker — connecting them requires per-airport corridor data (verify-first).
 */
const CONTEXTUAL_CATEGORIES = new Set(["amenity", "restroom", "customs", "baggage", "ground_transport"]);
/** Categories where a long airside route is expected, so backtracking matters. */
const BACKTRACK_CATEGORIES = new Set(["gate", "lounge", "train"]);

/** Max fraction of the direct distance a route may spend moving away from the dest. */
export const MAX_BACKTRACK_RATIO = 0.5;
/**
 * Absolute floor: a route is only flagged when it also runs backward at least
 * this far. A lounge a few metres past security legitimately reads as a high
 * *ratio* because of the mandatory checkpoint detour, but it is not a zigzag
 * bug. The SEA M-shape that motivated this rule was hundreds of metres backward.
 */
export const MIN_BACKTRACK_METERS = 120;
/** A node this far from the layout center is almost certainly a wrong/guessed coord. */
export const MAX_NODE_DISTANCE_FROM_CENTER_M = 15_000;

/** Train terminii off-airport (e.g. Roma Termini) may exceed the airport bbox. */
function offAirportTrainDestinationNodeIds(layout: AirportLayout): Set<string> {
  const center = layout.center;
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const exempt = new Set<string>();
  for (const edge of layout.edges) {
    if (edge.kind !== "train") continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    const fromNear = metersBetween(from.pos, center) <= MAX_NODE_DISTANCE_FROM_CENTER_M;
    const toFar = metersBetween(to.pos, center) > MAX_NODE_DISTANCE_FROM_CENTER_M;
    if (fromNear && toFar) exempt.add(to.id);
  }
  return exempt;
}

export interface LayoutQualityReport {
  iata: string;
  errors: string[];
  warnings: string[];
}

/**
 * Audit a layout for the failure modes that recur across airports. Uses the most
 * permissive credentials so a missing lane is never mistaken for an unreachable
 * destination.
 */
export function auditLayoutRouting(layout: AirportLayout): LayoutQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const creds: TravelerSecurityCredentials = { tsaPreCheck: true, clear: true, known: true };
  const origin = resolveLandsideOriginNodeId(layout);

  if (!origin) {
    errors.push("No landside origin node found (need at least one landside node to route from).");
    return { iata: layout.iata, errors, warnings };
  }

  // 1) Gross coordinate sanity — catches wrong-city / ocean / typo coordinates.
  const center = layout.center;
  const offAirportTrainNodes = offAirportTrainDestinationNodeIds(layout);
  for (const node of layout.nodes) {
    if (offAirportTrainNodes.has(node.id)) continue;
    const d = metersBetween(node.pos, center);
    if (d > MAX_NODE_DISTANCE_FROM_CENTER_M) {
      errors.push(
        `Node ${node.id} is ${Math.round(d / 1000)} km from the airport center — almost certainly a wrong coordinate.`,
      );
    }
  }

  // 2) Reachability + 3) no-backtrack, over every real destination POI.
  const seenNodes = new Set<string>();
  let auditedDestinations = 0;
  for (const poi of layout.pois) {
    const isRoutable = ROUTABLE_DESTINATION_CATEGORIES.has(poi.category);
    const isContextual = CONTEXTUAL_CATEGORIES.has(poi.category);
    if (!isRoutable && !isContextual) continue;
    // Deduplicate multiple POIs on the same node (e.g. security lane variants).
    const routeKey = `${poi.nodeId}`;
    const route = computeRoute({ layout, fromNodeId: origin, toPoiId: poi.id, credentials: creds });
    if (!route) {
      const message = `Destination "${poi.name}" (${poi.id}) is unreachable from the landside origin (${origin}).`;
      if (isRoutable) errors.push(message);
      else warnings.push(`${message} (contextual pin — connect it or leave as display-only.)`);
      continue;
    }
    auditedDestinations += 1;
    if (BACKTRACK_CATEGORIES.has(poi.category) && !seenNodes.has(routeKey)) {
      seenNodes.add(routeKey);
      // Judge backtracking from the destination's OWN terminal curb (nearest
      // landside node), so a multi-terminal airport isn't penalised for the long
      // way around the horseshoe from a single global origin.
      const localOrigin = nearestLandsideOriginNodeId(layout, poi.nodeId) ?? origin;
      const localRoute = computeRoute({ layout, fromNodeId: localOrigin, toPoiId: poi.id, credentials: creds });
      const stats = localRoute ? backtrackStats(localRoute.coordinates) : { ratio: 0, backwardM: 0 };
      if (stats.ratio > MAX_BACKTRACK_RATIO && stats.backwardM > MIN_BACKTRACK_METERS) {
        errors.push(
          `Route to "${poi.name}" (${poi.id}) from its nearest curb (${localOrigin}) backtracks ` +
            `${(stats.ratio * 100).toFixed(0)}% of the direct distance (${Math.round(stats.backwardM)} m backward, ` +
            `max ${(MAX_BACKTRACK_RATIO * 100).toFixed(0)}%) — the graph likely routes through a far hub instead of ` +
            `the nearer corridor. Path: ${localRoute!.nodeIds.join(" → ")}`,
        );
      }
    }
  }

  if (auditedDestinations === 0) {
    warnings.push("No routable destination POIs (gate/lounge/checkin/…) were audited.");
  }

  return { iata: layout.iata, errors, warnings };
}

/** Convenience: throws with a combined message if the layout has any hard errors. */
export function assertLayoutRoutingQuality(layout: AirportLayout): void {
  const { iata, errors } = auditLayoutRouting(layout);
  if (errors.length > 0) {
    throw new Error(`Airport ${iata} layout failed routing-quality audit:\n  - ${errors.join("\n  - ")}`);
  }
}
