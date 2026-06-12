/**
 * Kepi Airport Navigator — routing engine (Phase 0).
 *
 * Pure functions over an AirportLayout graph:
 *  - snapToGraph: raw GPS → nearest graph node with confidence score
 *  - computeRoute: A* from a node to a POI, gating security edges by the
 *    traveler's credentials (PreCheck / CLEAR / standard)
 *  - resolveGateNode: "C11" → gate-C node via the layout's prefix resolver
 *
 * Runs identically client-side (offline rerouting) and server-side.
 */

import type {
  AirportLayout,
  ComputedRoute,
  GraphEdge,
  GraphNode,
  RouteInstruction,
  SecurityLaneType,
  SnappedPosition,
  TravelerSecurityCredentials,
} from "./types";

// ── Geometry helpers ────────────────────────────────────────────────────────

const EARTH_M_PER_DEG_LAT = 111_320;

function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

// ── Lane gating ─────────────────────────────────────────────────────────────

/** Which security lanes this traveler may use, best-first. */
export function allowedLanes(creds: TravelerSecurityCredentials): SecurityLaneType[] {
  const lanes: SecurityLaneType[] = [];
  if (creds.clear) lanes.push("clear");
  if (creds.tsaPreCheck) lanes.push("precheck");
  lanes.push("standard");
  return lanes;
}

function edgeUsable(edge: GraphEdge, lanes: SecurityLaneType[]): boolean {
  if (edge.kind !== "security_transition") return true;
  return edge.laneType !== undefined && lanes.includes(edge.laneType);
}

// ── Snapping ────────────────────────────────────────────────────────────────

/**
 * Snap a raw GPS fix to the nearest graph node. The schematic layout is only
 * accurate to tens of meters, so node-level snapping (not edge projection) is
 * the honest granularity for v1. Confidence decays with off-graph distance.
 */
export function snapToGraph(layout: AirportLayout, lng: number, lat: number): SnappedPosition | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const node of layout.nodes) {
    const d = metersBetween([lng, lat], node.pos);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  if (!best || bestDist > 600) return null; // not plausibly in the terminal area
  // 0m off-graph → 0.95; 300m+ → 0.2 floor. Never claim 1.0 from GPS.
  const confidence = Math.max(0.2, Math.min(0.95, 0.95 - (bestDist / 300) * 0.75));
  return { pos: best.pos, nearestNodeId: best.id, offGraphMeters: Math.round(bestDist), confidence };
}

// ── Gate resolution ─────────────────────────────────────────────────────────

/** "C11" / "N7" / "B" → graph node id, via the layout's prefix resolver. */
export function resolveGateNode(layout: AirportLayout, gateCode: string): string | null {
  const code = gateCode.trim().toUpperCase();
  // Longest prefix wins so multi-letter concourses would work later.
  const matches = layout.gateNodeResolver
    .filter((entry) => code.startsWith(entry.prefix.toUpperCase()))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0]?.nodeId ?? null;
}

// ── A* routing ──────────────────────────────────────────────────────────────

interface AdjEntry {
  edge: GraphEdge;
  toNodeId: string;
}

function buildAdjacency(layout: AirportLayout): Map<string, AdjEntry[]> {
  const adj = new Map<string, AdjEntry[]>();
  const add = (fromId: string, entry: AdjEntry) => {
    const list = adj.get(fromId);
    if (list) list.push(entry);
    else adj.set(fromId, [entry]);
  };
  for (const edge of layout.edges) {
    add(edge.from, { edge, toNodeId: edge.to });
    if (edge.bidirectional) add(edge.to, { edge, toNodeId: edge.from });
  }
  return adj;
}

export interface ComputeRouteOptions {
  layout: AirportLayout;
  fromNodeId: string;
  toPoiId: string;
  credentials: TravelerSecurityCredentials;
  /** "sprint" reprices walking edges at a brisk 1.65 m/s (running-late pace). */
  profile?: "default" | "sprint";
}

const SPRINT_MPS = 1.65;

/** Edge traversal cost in seconds under the given profile. */
function edgeCost(edge: GraphEdge, profile: "default" | "sprint"): number {
  if (profile === "sprint" && (edge.kind === "walkway" || edge.kind === "moving_walkway")) {
    return Math.round(edge.lengthM / SPRINT_MPS);
  }
  return edge.traverseSeconds;
}

export function computeRoute(options: ComputeRouteOptions): ComputedRoute | null {
  const { layout, fromNodeId, toPoiId, credentials } = options;
  const profile = options.profile ?? "default";
  const poi = layout.pois.find((entry) => entry.id === toPoiId);
  if (!poi) return null;
  const targetNodeId = poi.nodeId;
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const startNode = nodeById.get(fromNodeId);
  const targetNode = nodeById.get(targetNodeId);
  if (!startNode || !targetNode) return null;

  const lanes = allowedLanes(credentials);
  const adjacency = buildAdjacency(layout);

  // A* — cost in seconds; heuristic = straight-line walk time (admissible).
  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, { nodeId: string; edge: GraphEdge }>();
  const open = new Set<string>([fromNodeId]);
  const heuristic = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    return node ? metersBetween(node.pos, targetNode.pos) / 1.4 : 0;
  };

  while (open.size > 0) {
    let current: string | null = null;
    let bestF = Infinity;
    for (const candidate of open) {
      const f = (gScore.get(candidate) ?? Infinity) + heuristic(candidate);
      if (f < bestF) {
        bestF = f;
        current = candidate;
      }
    }
    if (current === null) break;
    if (current === targetNodeId) break;
    open.delete(current);

    for (const { edge, toNodeId } of adjacency.get(current) ?? []) {
      if (!edgeUsable(edge, lanes)) continue;
      // Among usable parallel security edges, prefer the best lane we hold:
      // lane edges already differ in traverseSeconds, so cost handles it.
      const tentative = (gScore.get(current) ?? Infinity) + edgeCost(edge, profile);
      if (tentative < (gScore.get(toNodeId) ?? Infinity)) {
        gScore.set(toNodeId, tentative);
        cameFrom.set(toNodeId, { nodeId: current, edge });
        open.add(toNodeId);
      }
    }
  }

  if (!cameFrom.has(targetNodeId) && fromNodeId !== targetNodeId) return null;

  // Reconstruct path
  const nodeIds: string[] = [targetNodeId];
  const edgesUsed: GraphEdge[] = [];
  let cursor = targetNodeId;
  while (cursor !== fromNodeId) {
    const step = cameFrom.get(cursor);
    if (!step) break;
    edgesUsed.unshift(step.edge);
    cursor = step.nodeId;
    nodeIds.unshift(cursor);
  }

  const coordinates: [number, number][] = nodeIds
    .map((id) => nodeById.get(id)?.pos)
    .filter((pos): pos is [number, number] => Array.isArray(pos));

  const totalMeters = edgesUsed.reduce((sum, edge) => sum + edge.lengthM, 0);
  const totalSeconds = edgesUsed.reduce((sum, edge) => sum + edgeCost(edge, profile), 0);
  const laneUsed = edgesUsed.find((edge) => edge.kind === "security_transition")?.laneType;
  const instructions = buildInstructions(nodeIds, edgesUsed, nodeById, poi.name);

  return { fromNodeId, toPoiId, nodeIds, coordinates, totalMeters, totalSeconds, instructions, laneUsed };
}

// ── Turn-by-turn instruction generation ─────────────────────────────────────

function turnWord(delta: number): "straight" | "left" | "right" {
  const normalized = ((delta + 540) % 360) - 180; // -180..180
  if (normalized > 35) return "right";
  if (normalized < -35) return "left";
  return "straight";
}

function buildInstructions(
  nodeIds: string[],
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
  destinationName: string,
): RouteInstruction[] {
  const instructions: RouteInstruction[] = [];
  let metersSoFar = 0;
  let previousBearing: number | null = null;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const fromNode = nodeById.get(nodeIds[i]);
    const toNode = nodeById.get(nodeIds[i + 1]);
    if (!fromNode || !toNode) continue;

    if (edge.kind === "security_transition") {
      const laneLabel =
        edge.laneType === "clear" ? "the CLEAR lane" :
        edge.laneType === "precheck" ? "the TSA PreCheck lane" :
        edge.laneType === "priority" ? "the priority lane" : "the standard lane";
      instructions.push({
        text: `Go through security using ${laneLabel}`,
        maneuver: "security",
        atMeters: metersSoFar,
        landmark: fromNode.landmark,
      });
      previousBearing = null; // orientation resets after security
    } else if (edge.kind === "train") {
      instructions.push({
        text: `Board the train toward ${toNode.landmark ?? "your concourse"}`,
        maneuver: "train_board",
        atMeters: metersSoFar,
        landmark: fromNode.landmark,
      });
      instructions.push({
        text: "Exit the train and follow signs to your gate",
        maneuver: "train_exit",
        atMeters: metersSoFar + edge.lengthM,
      });
      previousBearing = null;
    } else {
      const segBearing = bearingDeg(fromNode.pos, toNode.pos);
      const turn = previousBearing === null ? "straight" : turnWord(segBearing - previousBearing);
      const distanceFt = Math.round((edge.lengthM * 3.28084) / 10) * 10;
      const toward = toNode.landmark ? ` toward ${toNode.landmark}` : "";
      if (turn === "straight") {
        instructions.push({
          text: `Continue straight ${distanceFt} ft${toward}`,
          maneuver: "straight",
          atMeters: metersSoFar,
          landmark: toNode.landmark,
        });
      } else {
        instructions.push({
          text: `Turn ${turn.toUpperCase()}${toward} (${distanceFt} ft)`,
          maneuver: turn,
          atMeters: metersSoFar,
          landmark: toNode.landmark,
        });
      }
      previousBearing = segBearing;
    }
    metersSoFar += edge.lengthM;
  }

  instructions.push({
    text: `Arrive: ${destinationName}`,
    maneuver: "arrive",
    atMeters: metersSoFar,
  });
  return instructions;
}
