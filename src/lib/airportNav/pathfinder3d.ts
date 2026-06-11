import type {
  AirportTerminal3DModel,
  GraphEdge,
  GraphNode,
  IndoorPositionFix,
  NavigationPath,
  PathSegment,
  Point3D,
  SecurityLaneType,
  TravelerCredentials,
  TurnInstruction,
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
  edge: GraphEdge;
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
  edge: GraphEdge,
  credentials: TravelerCredentials,
): boolean {
  if (edge.kind !== "security_transition" || !edge.laneType) return true;
  const needed = resolveSecurityLane(credentials);
  if (needed === "clear_precheck") {
    return edge.laneType === "clear_precheck" || edge.laneType === "clear";
  }
  return edge.laneType === needed;
}

function edgeCost(edge: GraphEdge, profile: RouteProfile): number {
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
): GraphNode | null {
  if (fix.snappedNodeId) {
    const exact = graph.nodes.find((node) => node.id === fix.snappedNodeId);
    if (exact) return exact;
  }
  let best: GraphNode | null = null;
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
): { nodeIds: string[]; edges: GraphEdge[]; totalCost: number } | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { nodeId: string; edge: GraphEdge }>();
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
  const edges: GraphEdge[] = [];
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
  edge: GraphEdge,
  fromNode: GraphNode,
  toNode: GraphNode,
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
  edges: GraphEdge[],
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
  region: GraphNode["region"],
): GraphNode | undefined {
  return model.graph.nodes.find((node) => node.region === region);
}

export { haversineMeters, nearestNode, resolveSecurityLane };
