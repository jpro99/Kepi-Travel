/**
 * Generalized KAC draft overlay — additive merge onto curated layout.
 *
 * Curated nodes, edges, and POIs always win on ID collision. KAC gate dots are
 * unrouted reference pins; AREA lounge dots have no routable edges.
 */

import { haversineMeters } from "../footwayGraph";
import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "../types";
import {
  isCuratedEdgeId,
  isCuratedNodeId,
  isCuratedPoiId,
  type CuratedGraphGuards,
} from "./curatedGraphGuards";

const DUPLICATE_GROUND_TRANSPORT_M = 8;

export interface KacOverlayOptions {
  /** Merge KAC gate door-ref resolver entries (longest-prefix at query time). */
  mergeGateResolver?: boolean;
  /** Downgrade matching KAC gate POIs to unrouted amenity reference pins. */
  unroutedGatePoiIdPrefix?: string;
  /** Schematic club AREA dots — drop any KAC edge touching these nodes. */
  areaLoungeNodeIds?: readonly string[];
}

export interface KacOverlayResult {
  layout: AirportLayout;
  stats: {
    zonesAdded: number;
    gateNodesAdded: number;
    schematicNodesAdded: number;
    edgesAdded: number;
    gatePoisAdded: number;
    areaLoungePoisAdded: number;
    skippedDuplicateGroundTransport: number;
    droppedDanglingEdges: number;
  };
}

function mergeById<T extends { id: string }>(
  curated: T[],
  incoming: T[],
  shouldSkip?: (item: T) => boolean,
): { merged: T[]; added: number } {
  const byId = new Map(curated.map((item) => [item.id, item]));
  let added = 0;
  for (const item of incoming) {
    if (shouldSkip?.(item)) continue;
    if (byId.has(item.id)) continue;
    byId.set(item.id, item);
    added += 1;
  }
  return { merged: [...byId.values()], added };
}

function mergeGateResolvers(
  curated: AirportLayout["gateNodeResolver"],
  kac: AirportLayout["gateNodeResolver"],
): AirportLayout["gateNodeResolver"] {
  const seen = new Set(curated.map((e) => e.prefix.toUpperCase()));
  const merged = [...curated];
  for (const entry of kac) {
    const key = entry.prefix.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.sort((a, b) => b.prefix.length - a.prefix.length);
}

function hasNearbyCuratedGroundTransport(
  guards: CuratedGraphGuards,
  nodes: Map<string, GraphNode>,
  candidate: GraphNode,
): boolean {
  if (candidate.kind !== "ground_transport") return false;
  for (const id of guards.nodeIds) {
    const curated = nodes.get(id);
    if (!curated || curated.kind !== "ground_transport") continue;
    if (haversineMeters(curated.pos, candidate.pos) <= DUPLICATE_GROUND_TRANSPORT_M) {
      return true;
    }
  }
  return false;
}

function toAreaLoungePoi(poi: PoiDefinition): PoiDefinition {
  return {
    ...poi,
    category: "amenity",
    precision: poi.precision ?? "schematic",
    minZoomToShow: poi.minZoomToShow ?? 16,
    notes:
      poi.notes ??
      "Approximate club AREA pin — follow signs; no indoor turn-by-turn route.",
  };
}

function toUnroutedGatePoi(poi: PoiDefinition): PoiDefinition {
  return {
    ...poi,
    category: "amenity",
    precision: poi.precision ?? "schematic",
    minZoomToShow: poi.minZoomToShow ?? 17,
    notes:
      "Approximate OSM gate door-ref — unrouted reference pin. Follow signs; no indoor route.",
  };
}

/**
 * Overlay a KAC-adapted layout onto the curated live layout.
 */
export function applyKacOverlay(
  curated: AirportLayout,
  kacLayout: AirportLayout,
  guards: CuratedGraphGuards,
  options: KacOverlayOptions = {},
): KacOverlayResult {
  if (curated.iata !== kacLayout.iata) {
    throw new Error(`applyKacOverlay iata mismatch: ${curated.iata} vs ${kacLayout.iata}`);
  }

  const areaLoungeIds = new Set(options.areaLoungeNodeIds ?? []);
  const curatedNodeMap = new Map(curated.nodes.map((n) => [n.id, n]));

  const kacZones = kacLayout.zones.filter((z) => !curated.zones.some((c) => c.id === z.id));
  const zones = [...curated.zones, ...kacZones];

  const incomingNodes = kacLayout.nodes.filter((node) => {
    if (isCuratedNodeId(guards, node.id)) return false;
    if (hasNearbyCuratedGroundTransport(guards, curatedNodeMap, node)) return false;
    return true;
  });

  const { merged: nodes } = mergeById(curated.nodes, incomingNodes);
  const mergedNodeIds = new Set(nodes.map((n) => n.id));
  const gateNodesAdded = incomingNodes.filter((n) => n.kind === "gate").length;
  const schematicNodesAdded = incomingNodes.filter((n) => n.kind !== "gate").length;

  const skippedDuplicateGroundTransport = kacLayout.nodes.filter(
    (n) =>
      n.kind === "ground_transport" &&
      !isCuratedNodeId(guards, n.id) &&
      hasNearbyCuratedGroundTransport(guards, curatedNodeMap, n),
  ).length;

  let droppedDanglingEdges = 0;
  const incomingEdges = kacLayout.edges.filter((edge) => {
    if (isCuratedEdgeId(guards, edge.id)) return false;
    if (isCuratedNodeId(guards, edge.from) || isCuratedNodeId(guards, edge.to)) return false;
    if (areaLoungeIds.has(edge.from) || areaLoungeIds.has(edge.to)) return false;
    if (!mergedNodeIds.has(edge.from) || !mergedNodeIds.has(edge.to)) {
      droppedDanglingEdges += 1;
      return false;
    }
    return true;
  });

  const { merged: edges, added: edgesAdded } = mergeById(curated.edges, incomingEdges);

  const gatePrefix = options.unroutedGatePoiIdPrefix;
  const incomingPois = kacLayout.pois
    .filter((poi) => {
      if (isCuratedPoiId(guards, poi.id)) return false;
      if (isCuratedNodeId(guards, poi.nodeId)) return false;
      if (!mergedNodeIds.has(poi.nodeId)) return false;
      if (areaLoungeIds.has(poi.nodeId)) return true;
      const node = curatedNodeMap.get(poi.nodeId);
      if (node && hasNearbyCuratedGroundTransport(guards, curatedNodeMap, node)) return false;
      return true;
    })
    .map((poi): PoiDefinition => {
      if (areaLoungeIds.has(poi.nodeId)) return toAreaLoungePoi(poi);
      if (gatePrefix && poi.id.startsWith(gatePrefix) && poi.category === "gate") {
        return toUnroutedGatePoi(poi);
      }
      return poi;
    });

  const { merged: pois } = mergeById(curated.pois, incomingPois);
  const gatePoisAdded = gatePrefix
    ? incomingPois.filter((p) => p.id.startsWith(gatePrefix)).length
    : 0;
  const areaLoungePoisAdded = incomingPois.filter((p) => areaLoungeIds.has(p.nodeId)).length;

  const layout: AirportLayout = {
    ...curated,
    layoutVersion: `${curated.layoutVersion}+kac-${kacLayout.layoutVersion}`,
    updatedAt: kacLayout.updatedAt,
    zones,
    nodes,
    edges,
    pois,
    gateNodeResolver: options.mergeGateResolver
      ? mergeGateResolvers(curated.gateNodeResolver, kacLayout.gateNodeResolver)
      : curated.gateNodeResolver,
    routeGrade: curated.routeGrade ?? "schematic",
  };

  assertCuratedPreserved(curated, layout, guards);

  return {
    layout,
    stats: {
      zonesAdded: kacZones.length,
      gateNodesAdded,
      schematicNodesAdded,
      edgesAdded,
      gatePoisAdded,
      areaLoungePoisAdded,
      skippedDuplicateGroundTransport,
      droppedDanglingEdges,
    },
  };
}

function assertCuratedPreserved(
  before: AirportLayout,
  after: AirportLayout,
  guards: CuratedGraphGuards,
): void {
  for (const id of guards.nodeIds) {
    const node = after.nodes.find((n) => n.id === id);
    const expected = before.nodes.find((n) => n.id === id);
    if (!node || !expected) {
      throw new Error(`KAC overlay dropped curated node: ${id}`);
    }
    if (node.pos[0] !== expected.pos[0] || node.pos[1] !== expected.pos[1]) {
      throw new Error(`KAC overlay moved curated node: ${id}`);
    }
  }

  for (const id of guards.edgeIds) {
    const edge = after.edges.find((e) => e.id === id);
    const expected = before.edges.find((e) => e.id === id);
    if (!edge || !expected) {
      throw new Error(`KAC overlay dropped curated edge: ${id}`);
    }
    if (
      edge.traverseSeconds !== expected.traverseSeconds ||
      edge.lengthM !== expected.lengthM
    ) {
      throw new Error(`KAC overlay changed curated edge: ${id}`);
    }
  }

  for (const id of guards.poiIds) {
    if (!after.pois.some((p) => p.id === id)) {
      throw new Error(`KAC overlay dropped curated POI: ${id}`);
    }
  }
}

/** Type guard helper for tests — exported edge snapshot compare. */
export function curatedEdgeSnapshot(
  layout: AirportLayout,
  edgeIds: readonly string[],
): Pick<GraphEdge, "id" | "traverseSeconds" | "lengthM">[] {
  return edgeIds.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}
