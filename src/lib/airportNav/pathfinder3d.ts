import type {
  AirportTerminal3DModel,
  NavGraphEdge,
  NavGraphNode,
  IndoorPositionFix,
  NavigationPath,
  PathSegment,
  Point3D,
  SecurityLaneType,
  TravelerCredentials,
  TurnInstruction,
  WalkwayGraph,
} from "./types";
import { generateId } from "@/lib/utils/generateId";

export type RouteProfile = "default" | "sprint" | "accessible" | "together";

export interface RouteRequest {
  model: AirportTerminal3DModel;
  fix: IndoorPositionFix;
  toPoiId: string;
  credentials: TravelerCredentials;
  profile?: RouteProfile;
}

interface ScoredEdge {
  edge: NavGraphEdge;
  toNodeId: string;
  cost: number;
}

function haversineMeters(a: Point3D, b: Point3D): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

function resolveSecurityLane(credentials: TravelerCredentials): SecurityLaneType {
  const pre =
    credentials.tsaPreCheck === true || credentials.globalEntry === true;
  const clear = credentials.clear === true;
  if (clear && pre) return "clear_precheck";
  if (clear) return "clear";
  if (pre) return "precheck";
  return "standard";
}

function laneAllowed(
  edge: NavGraphEdge,
  credentials: TravelerCredentials,
): boolean {
  if (edge.kind !== "security_transition" || !edge.laneType) return true;
  const needed = resolveSecurityLane(credentials);
  if (needed === "clear_precheck") {
    return edge.laneType === "clear_precheck" || edge.laneType === "clear";
  }
  return edge.laneType === needed;
}

function edgeCost(edge: NavGraphEdge, profile: RouteProfile): number {
  let cost = edge.traverseSeconds;
  if (profile === "sprint") {
    if (edge.kind === "stairs") cost *= 1.8;
    if (edge.kind === "elevator") cost *= 1.4;
    if (edge.kind === "moving_walkway") cost *= 0.75;
    if (edge.kind === "train") cost *= 0.9;
  }
  if (profile === "accessible") {
    if (!edge.accessible) return Number.POSITIVE_INFINITY;
    if (edge.kind === "stairs" || edge.kind === "escalator") {
      return Number.POSITIVE_INFINITY;
    }
  }
  return cost;
}

function nearestNode(
  graph: AirportTerminal3DModel["graph"],
  fix: IndoorPositionFix,
): NavGraphNode | null {
  if (fix.snappedNodeId) {
    const exact = graph.nodes.find((node) => node.id === fix.snappedNodeId);
    if (exact) return exact;
  }
  let best: NavGraphNode | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const node of graph.nodes) {
    const dist = haversineMeters(fix.pos, node.pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

function buildAdjacency(
  graph: AirportTerminal3DModel["graph"],
  credentials: TravelerCredentials,
  profile: RouteProfile,
): Map<string, ScoredEdge[]> {
  const adj = new Map<string, ScoredEdge[]>();
  for (const edge of graph.edges) {
    if (!laneAllowed(edge, credentials)) continue;
    const cost = edgeCost(edge, profile);
    if (!Number.isFinite(cost)) continue;

    const forward = adj.get(edge.from) ?? [];
    forward.push({ edge, toNodeId: edge.to, cost });
    adj.set(edge.from, forward);

    if (edge.bidirectional) {
      const reverse = adj.get(edge.to) ?? [];
      reverse.push({ edge, toNodeId: edge.from, cost });
      adj.set(edge.to, reverse);
    }
  }
  return adj;
}

function dijkstra(
  adj: Map<string, ScoredEdge[]>,
  startId: string,
  goalId: string,
): { nodeIds: string[]; edges: NavGraphEdge[]; totalCost: number } | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { nodeId: string; edge: NavGraphEdge }>();
  const queue = new Set<string>([startId]);
  dist.set(startId, 0);

  while (queue.size > 0) {
    let current: string | null = null;
    let currentDist = Number.POSITIVE_INFINITY;
    for (const nodeId of queue) {
      const nodeDist = dist.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (nodeDist < currentDist) {
        currentDist = nodeDist;
        current = nodeId;
      }
    }
    if (!current) break;
    if (current === goalId) break;
    queue.delete(current);

    for (const scored of adj.get(current) ?? []) {
      const alt = currentDist + scored.cost;
      const known = dist.get(scored.toNodeId);
      if (known === undefined || alt < known) {
        dist.set(scored.toNodeId, alt);
        prev.set(scored.toNodeId, { nodeId: current, edge: scored.edge });
        queue.add(scored.toNodeId);
      }
    }
  }

  if (!dist.has(goalId)) return null;

  const nodeIds: string[] = [goalId];
  const edges: NavGraphEdge[] = [];
  let cursor = goalId;
  while (cursor !== startId) {
    const step = prev.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge);
    nodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }

  return { nodeIds, edges, totalCost: dist.get(goalId) ?? 0 };
}

function instructionForEdge(
  edge: NavGraphEdge,
  fromNode: NavGraphNode,
  toNode: NavGraphNode,
): TurnInstruction {
  if (edge.kind === "security_transition") {
    return {
      text: `Enter ${edge.laneType?.replace("_", " ") ?? "security"} screening`,
      spokenText: "Proceed through security screening",
      maneuver: "security",
      triggerDistanceM: 8,
      landmark: toNode.landmark,
    };
  }
  if (edge.kind === "train") {
    return {
      text: `Board the airport train toward ${toNode.landmark ?? toNode.id}`,
      spokenText: "Take the airport train",
      maneuver: "train_board",
      triggerDistanceM: 15,
      landmark: fromNode.landmark,
    };
  }
  if (edge.kind === "escalator") {
    return {
      text: `Take the escalator to ${toNode.landmark ?? "the next level"}`,
      maneuver: "escalator_up",
      triggerDistanceM: 10,
      landmark: fromNode.landmark,
    };
  }
  return {
    text: `Continue toward ${toNode.landmark ?? toNode.id}`,
    spokenText: `Head toward ${toNode.landmark ?? "your destination"}`,
    maneuver: "straight",
    triggerDistanceM: 20,
    landmark: toNode.landmark,
  };
}

function edgesToSegments(
  model: AirportTerminal3DModel,
  nodeIds: string[],
  edges: NavGraphEdge[],
): PathSegment[] {
  const nodeById = new Map(model.graph.nodes.map((node) => [node.id, node]));
  const segments: PathSegment[] = [];

  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) continue;

    segments.push({
      id: generateId(),
      edgeIds: [edge.id],
      level: fromNode.pos.level,
      geometry: {
        type: "LineString",
        coordinates: [
          [fromNode.pos.lng, fromNode.pos.lat],
          [toNode.pos.lng, toNode.pos.lat],
        ],
      },
      instruction: instructionForEdge(edge, fromNode, toNode),
      progress: index === 0 ? "active" : "upcoming",
      warmth: index === 0 ? 1 : 0.35,
    });
  }

  if (segments.length === 0 && nodeIds.length >= 2) {
    const start = nodeById.get(nodeIds[0]);
    const end = nodeById.get(nodeIds[nodeIds.length - 1]);
    if (start && end) {
      segments.push({
        id: generateId(),
        edgeIds: [],
        level: start.pos.level,
        geometry: {
          type: "LineString",
          coordinates: [
            [start.pos.lng, start.pos.lat],
            [end.pos.lng, end.pos.lat],
          ],
        },
        instruction: {
          text: `Arrive at ${end.landmark ?? end.id}`,
          maneuver: "arrive",
          triggerDistanceM: 5,
        },
        progress: "active",
        warmth: 1,
      });
    }
  }

  return segments;
}

export function snapFixToGraph(
  model: AirportTerminal3DModel,
  fix: IndoorPositionFix,
  maxSnapMeters = 150,
): IndoorPositionFix {
  const nearest = nearestNode(model.graph, fix);
  if (!nearest) return fix;
  const dist = haversineMeters(fix.pos, nearest.pos);
  if (dist > maxSnapMeters) {
    return {
      ...fix,
      snappedNodeId: undefined,
      confidence: Math.min(fix.confidence, 0.42),
    };
  }
  const confidence =
    dist <= 25 ? Math.max(fix.confidence, 0.72) : Math.max(fix.confidence * 0.85, 0.35);
  return {
    ...fix,
    pos: { ...nearest.pos },
    snappedNodeId: nearest.id,
    confidence,
    source: fix.source === "user_confirmed" ? "user_confirmed" : "gps_snap",
  };
}

export function computeRoute(request: RouteRequest): NavigationPath | null {
  const { model, fix, toPoiId, credentials } = request;
  const profile = request.profile ?? "default";
  const poi = model.pois.find((entry) => entry.id === toPoiId);
  if (!poi) return null;

  const startNode = nearestNode(model.graph, fix);
  const goalNode = model.graph.nodes.find((node) => node.id === poi.nodeId);
  if (!startNode || !goalNode) return null;

  const adj = buildAdjacency(model.graph, credentials, profile);
  const result = dijkstra(adj, startNode.id, goalNode.id);
  if (!result) return null;

  const segments = edgesToSegments(model, result.nodeIds, result.edges);
  const totalMeters = result.edges.reduce((sum, edge) => sum + edge.lengthM, 0);

  return {
    id: generateId(),
    fromNodeId: startNode.id,
    toPoiId,
    profile,
    segments,
    totalSeconds: Math.round(result.totalCost),
    totalMeters: Math.round(totalMeters),
    computedAt: new Date().toISOString(),
    validForPhase: ["landside", "checkin", "security_queue", "security", "airside", "lounge", "to_gate"],
  };
}

export function findNodeByRegion(
  model: AirportTerminal3DModel,
  region: NavGraphNode["region"],
): NavGraphNode | undefined {
  return model.graph.nodes.find((node) => node.region === region);
}

function bearingDegrees(a: Point3D, b: Point3D): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angularDiffDegrees(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function interpolatePoint(a: Point3D, b: Point3D, fraction: number): Point3D {
  return {
    lng: a.lng + (b.lng - a.lng) * fraction,
    lat: a.lat + (b.lat - a.lat) * fraction,
    level: a.level,
  };
}

export interface DeadReckoningProjection {
  /** Position constrained to the walkway graph (never through a wall). */
  pos: Point3D;
  /** Graph node the traveler is at/nearest after walking the displacement. */
  snappedNodeId: string | undefined;
  /**
   * True when the graph cannot resolve where the displacement went — an
   * off-corridor heading or an equally-plausible branch. Callers must lower
   * confidence; we never fabricate a turn the graph does not offer.
   */
  ambiguous: boolean;
  /** Meters actually advanced along the graph (<= raw displacement). */
  advancedMeters: number;
}

const DR_MIN_MOVE_M = 0.75;
const DR_MAX_TURN_DEG = 70;
const DR_BRANCH_AMBIGUITY_DEG = 30;

/**
 * Map-aided dead reckoning.
 *
 * A raw dead-reckoning fix is a free-space estimate (step count + heading) and
 * drifts — projected naively it walks straight through walls and snaps to the
 * geometrically-nearest node even when that node is unreachable. This constrains
 * the previous→incoming displacement to the airport walkway graph: starting from
 * the last known node, it walks the displacement distance along connected edges,
 * following the edge whose bearing best matches the traveler's heading and
 * transitioning at junctions. It refuses to invent a turn the graph does not
 * offer (marks `ambiguous`) and refuses to pick between two equally-plausible
 * branches (marks `ambiguous`). It only constrains geometry — it never raises
 * confidence; the caller keeps the dead-reckoning decay and adds an ambiguity
 * penalty.
 */
export function projectDeadReckoningOnGraph(
  graph: WalkwayGraph,
  previous: IndoorPositionFix,
  incoming: IndoorPositionFix,
): DeadReckoningProjection {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  let anchor: NavGraphNode | null = null;
  if (previous.snappedNodeId) {
    anchor = nodeById.get(previous.snappedNodeId) ?? null;
  }
  if (!anchor) anchor = nearestNode(graph, previous);
  if (!anchor) {
    return {
      pos: incoming.pos,
      snappedNodeId: incoming.snappedNodeId,
      ambiguous: false,
      advancedMeters: 0,
    };
  }

  const displacementM = haversineMeters(previous.pos, incoming.pos);
  if (displacementM < DR_MIN_MOVE_M) {
    return {
      pos: { ...anchor.pos },
      snappedNodeId: anchor.id,
      ambiguous: false,
      advancedMeters: 0,
    };
  }

  const travelBearing = bearingDegrees(previous.pos, incoming.pos);

  const adjacency = new Map<string, NavGraphNode[]>();
  const pushAdjacency = (fromId: string, toId: string) => {
    const to = nodeById.get(toId);
    if (!to) return;
    const list = adjacency.get(fromId) ?? [];
    list.push(to);
    adjacency.set(fromId, list);
  };
  for (const edge of graph.edges) {
    pushAdjacency(edge.from, edge.to);
    if (edge.bidirectional) pushAdjacency(edge.to, edge.from);
  }

  let remaining = displacementM;
  let current = anchor;
  let cameFromId: string | null = null;
  let ambiguous = false;
  let resultPos: Point3D = { ...anchor.pos };
  let resultNodeId = anchor.id;
  let advanced = 0;
  let guard = 0;

  while (remaining > DR_MIN_MOVE_M && guard < 128) {
    guard += 1;
    const allNeighbors = adjacency.get(current.id) ?? [];
    let neighbors = allNeighbors.filter((node) => node.id !== cameFromId);
    if (neighbors.length === 0) neighbors = allNeighbors;
    if (neighbors.length === 0) {
      // Isolated node: the graph offers nowhere to go but the sensors say we
      // moved. Do not teleport — stay put and flag ambiguity.
      if (remaining > 3) ambiguous = true;
      break;
    }

    const scored = neighbors
      .map((node) => ({
        node,
        diff: angularDiffDegrees(bearingDegrees(current.pos, node.pos), travelBearing),
      }))
      .sort((a, b) => a.diff - b.diff);

    const best = scored[0];
    if (best.diff > DR_MAX_TURN_DEG) {
      // Heading points somewhere the corridors here do not go.
      ambiguous = true;
      break;
    }
    if (
      scored.length >= 2 &&
      scored[1].diff <= DR_MAX_TURN_DEG &&
      scored[1].diff - best.diff < DR_BRANCH_AMBIGUITY_DEG
    ) {
      // Two corridors are equally plausible — refuse to guess.
      ambiguous = true;
      break;
    }

    const segmentM = haversineMeters(current.pos, best.node.pos);
    if (segmentM <= 0.01) {
      cameFromId = current.id;
      current = best.node;
      resultPos = { ...current.pos };
      resultNodeId = current.id;
      continue;
    }
    if (remaining < segmentM) {
      const fraction = remaining / segmentM;
      resultPos = interpolatePoint(current.pos, best.node.pos, fraction);
      resultNodeId = fraction >= 0.5 ? best.node.id : current.id;
      advanced += remaining;
      remaining = 0;
      break;
    }
    remaining -= segmentM;
    advanced += segmentM;
    cameFromId = current.id;
    current = best.node;
    resultPos = { ...current.pos };
    resultNodeId = current.id;
  }

  return { pos: resultPos, snappedNodeId: resultNodeId, ambiguous, advancedMeters: advanced };
}

export { haversineMeters, nearestNode, resolveSecurityLane };
