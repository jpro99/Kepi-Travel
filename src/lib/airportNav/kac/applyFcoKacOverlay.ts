/**
 * FCO-only KAC draft overlay — additive merge onto curated layout.
 *
 * Adds OSM T1/T3 zone rings, unrouted gate dots, and schematic KAC arrivals
 * pins without replacing the curated passport → bags → customs → Leonardo graph.
 */

import { haversineMeters } from "../footwayGraph";
import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "../types";
import {
  FCO_CURATED_FIRST_MILE_EDGE_IDS,
  FCO_CURATED_FIRST_MILE_NODE_IDS,
  FCO_CURATED_FIRST_MILE_POI_IDS,
  isFcoCuratedFirstMileEdgeId,
  isFcoCuratedFirstMileNodeId,
  isFcoCuratedFirstMilePoiId,
} from "./fcoFirstMileGuards";

const DUPLICATE_GROUND_TRANSPORT_M = 8;

export interface FcoKacOverlayResult {
  layout: AirportLayout;
  stats: {
    zonesAdded: number;
    gateNodesAdded: number;
    schematicNodesAdded: number;
    edgesAdded: number;
    gatePoisAdded: number;
    skippedDuplicateGroundTransport: number;
  };
}

function hasNearbyCuratedGroundTransport(
  nodes: Map<string, GraphNode>,
  candidate: GraphNode,
): boolean {
  if (candidate.kind !== "ground_transport") return false;
  for (const id of FCO_CURATED_FIRST_MILE_NODE_IDS) {
    const curated = nodes.get(id);
    if (!curated || curated.kind !== "ground_transport") continue;
    if (haversineMeters(curated.pos, candidate.pos) <= DUPLICATE_GROUND_TRANSPORT_M) {
      return true;
    }
  }
  return false;
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

/**
 * Overlay a KAC-adapted FCO layout onto the curated live layout.
 * Curated first-mile nodes, edges, POIs, and minutes always win on ID collision.
 */
export function applyFcoKacOverlay(
  curated: AirportLayout,
  kacLayout: AirportLayout,
): FcoKacOverlayResult {
  if (curated.iata !== "FCO" || kacLayout.iata !== "FCO") {
    throw new Error("applyFcoKacOverlay is FCO-only");
  }

  const curatedNodeMap = new Map(curated.nodes.map((n) => [n.id, n]));

  const kacZones = kacLayout.zones.filter((z) => !curated.zones.some((c) => c.id === z.id));
  const zones = [...curated.zones, ...kacZones];

  const incomingNodes = kacLayout.nodes.filter((node) => {
    if (isFcoCuratedFirstMileNodeId(node.id)) return false;
    if (hasNearbyCuratedGroundTransport(curatedNodeMap, node)) return false;
    return true;
  });

  const { merged: nodes } = mergeById(curated.nodes, incomingNodes);
  const mergedNodeIds = new Set(nodes.map((n) => n.id));
  const gateNodesAdded = incomingNodes.filter((n) => n.kind === "gate").length;
  const schematicNodesAdded = incomingNodes.filter((n) => n.kind !== "gate").length;

  const skippedDuplicateGroundTransport =
    kacLayout.nodes.filter(
      (n) =>
        n.kind === "ground_transport" &&
        !isFcoCuratedFirstMileNodeId(n.id) &&
        hasNearbyCuratedGroundTransport(curatedNodeMap, n),
    ).length;

  const incomingEdges = kacLayout.edges.filter((edge) => {
    if (isFcoCuratedFirstMileEdgeId(edge.id)) return false;
    if (
      isFcoCuratedFirstMileNodeId(edge.from) ||
      isFcoCuratedFirstMileNodeId(edge.to)
    ) {
      return false;
    }
    // Drop KAC edges whose endpoints were not merged (e.g. duplicate Leonardo node).
    if (!mergedNodeIds.has(edge.from) || !mergedNodeIds.has(edge.to)) return false;
    return true;
  });

  const { merged: edges, added: edgesAdded } = mergeById(curated.edges, incomingEdges);

  const incomingPois = kacLayout.pois
    .filter((poi) => {
      if (isFcoCuratedFirstMilePoiId(poi.id)) return false;
      if (isFcoCuratedFirstMileNodeId(poi.nodeId)) return false;
      if (!mergedNodeIds.has(poi.nodeId)) return false;
      const node = curatedNodeMap.get(poi.nodeId);
      if (node && hasNearbyCuratedGroundTransport(curatedNodeMap, node)) return false;
      return true;
    })
    .map((poi): PoiDefinition => {
      if (poi.category !== "gate" || !poi.id.startsWith("poi:FCO:node:gate:")) {
        return poi;
      }
      // Unrouted OSM gate dots — contextual reference pins, not routable destinations.
      return {
        ...poi,
        category: "amenity",
        precision: poi.precision ?? "schematic",
        minZoomToShow: poi.minZoomToShow ?? 17,
        notes:
          "Approximate OSM gate door-ref — unrouted reference pin. Follow signs; no indoor route.",
      };
    });

  const { merged: pois } = mergeById(curated.pois, incomingPois);
  const gatePoisAdded = incomingPois.filter((p) => p.id.startsWith("poi:FCO:node:gate:")).length;

  const layout: AirportLayout = {
    ...curated,
    layoutVersion: `${curated.layoutVersion}+kac-${kacLayout.layoutVersion}`,
    updatedAt: kacLayout.updatedAt,
    zones,
    nodes,
    edges,
    pois,
    // KAC gate dots are unrouted reference pins — keep curated cluster resolvers
    // so arrival first mile still enters at gate-e → passport-t3.
    gateNodeResolver: curated.gateNodeResolver,
    routeGrade: "schematic",
  };

  assertFirstMilePreserved(curated, layout);

  return {
    layout,
    stats: {
      zonesAdded: kacZones.length,
      gateNodesAdded,
      schematicNodesAdded,
      edgesAdded,
      gatePoisAdded,
      skippedDuplicateGroundTransport,
    },
  };
}

function assertFirstMilePreserved(before: AirportLayout, after: AirportLayout): void {
  for (const id of FCO_CURATED_FIRST_MILE_NODE_IDS) {
    const node = after.nodes.find((n) => n.id === id);
    const expected = before.nodes.find((n) => n.id === id);
    if (!node || !expected) {
      throw new Error(`FCO overlay dropped curated first-mile node: ${id}`);
    }
    if (node.pos[0] !== expected.pos[0] || node.pos[1] !== expected.pos[1]) {
      throw new Error(`FCO overlay moved curated first-mile node: ${id}`);
    }
  }

  for (const id of FCO_CURATED_FIRST_MILE_EDGE_IDS) {
    const edge = after.edges.find((e) => e.id === id);
    const expected = before.edges.find((e) => e.id === id);
    if (!edge || !expected) {
      throw new Error(`FCO overlay dropped curated first-mile edge: ${id}`);
    }
    if (
      edge.traverseSeconds !== expected.traverseSeconds ||
      edge.lengthM !== expected.lengthM
    ) {
      throw new Error(`FCO overlay changed curated first-mile edge minutes: ${id}`);
    }
  }

  for (const id of FCO_CURATED_FIRST_MILE_POI_IDS) {
    if (!after.pois.some((p) => p.id === id)) {
      throw new Error(`FCO overlay dropped curated first-mile POI: ${id}`);
    }
  }
}

/** Type guard helper for tests — exported edge snapshot compare. */
export function curatedFirstMileEdgeSnapshot(layout: AirportLayout): Pick<GraphEdge, "id" | "traverseSeconds" | "lengthM">[] {
  return FCO_CURATED_FIRST_MILE_EDGE_IDS.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}

/** Type guard helper for tests — exported POI ids for first mile. */
export function curatedFirstMilePoiIds(layout: AirportLayout): PoiDefinition["id"][] {
  return FCO_CURATED_FIRST_MILE_POI_IDS.filter((id) => layout.pois.some((p) => p.id === id));
}
