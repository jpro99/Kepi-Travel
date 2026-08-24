/**
 * BRI-only KAC draft overlay — additive merge onto curated layout.
 *
 * Adds OSM terminal hull zone, schematic departures pins (curb → check-in →
 * security → Work Lounge), and drops any KAC edge/POI whose endpoint was not
 * merged (FCO lesson).
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "../types";
import { haversineMeters } from "../footwayGraph";
import {
  BRI_CURATED_EDGE_IDS,
  BRI_CURATED_NODE_IDS,
  BRI_CURATED_POI_IDS,
  isBriCuratedEdgeId,
  isBriCuratedNodeId,
  isBriCuratedPoiId,
} from "./briCuratedGuards";

export interface BriKacOverlayResult {
  layout: AirportLayout;
  stats: {
    zonesAdded: number;
    nodesAdded: number;
    edgesAdded: number;
    poisAdded: number;
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

/**
 * Overlay a KAC-adapted BRI layout onto the curated live layout.
 * Curated nodes, edges, POIs, and gateNodeResolver always win on ID collision.
 */
export function applyBriKacOverlay(
  curated: AirportLayout,
  kacLayout: AirportLayout,
): BriKacOverlayResult {
  if (curated.iata !== "BRI" || kacLayout.iata !== "BRI") {
    throw new Error("applyBriKacOverlay is BRI-only");
  }

  const kacZones = kacLayout.zones.filter((z) => !curated.zones.some((c) => c.id === z.id));
  const zones = [...curated.zones, ...kacZones];

  const incomingNodes = kacLayout.nodes.filter((node) => !isBriCuratedNodeId(node.id));
  const { merged: nodes, added: nodesAdded } = mergeById(curated.nodes, incomingNodes);
  const mergedNodeIds = new Set(nodes.map((n) => n.id));

  const incomingEdges = kacLayout.edges.filter((edge) => {
    if (isBriCuratedEdgeId(edge.id)) return false;
    if (isBriCuratedNodeId(edge.from) || isBriCuratedNodeId(edge.to)) return false;
    if (!mergedNodeIds.has(edge.from) || !mergedNodeIds.has(edge.to)) return false;
    return true;
  });

  const { merged: mergedEdges, added: edgesAdded } = mergeById(curated.edges, incomingEdges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = appendBriLandsideBridgeEdges(mergedEdges, nodeById);

  const incomingPois = kacLayout.pois.filter((poi) => {
    if (isBriCuratedPoiId(poi.id)) return false;
    if (isBriCuratedNodeId(poi.nodeId)) return false;
    if (!mergedNodeIds.has(poi.nodeId)) return false;
    return true;
  });

  const { merged: pois, added: poisAdded } = mergeById(curated.pois, incomingPois);

  const layout: AirportLayout = {
    ...curated,
    layoutVersion: `${curated.layoutVersion}+kac-${kacLayout.layoutVersion}`,
    updatedAt: kacLayout.updatedAt,
    zones,
    nodes,
    edges,
    pois,
    gateNodeResolver: curated.gateNodeResolver,
    routeGrade: "schematic",
  };

  assertCuratedPreserved(curated, layout);

  return {
    layout,
    stats: {
      zonesAdded: kacZones.length,
      nodesAdded,
      edgesAdded: edges.length - curated.edges.length,
      poisAdded,
    },
  };
}

const WALK_MPS = 1.25;

/** Honest walkway links from curated curb-main into the KAC departures subgraph. */
function appendBriLandsideBridgeEdges(
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
): GraphEdge[] {
  const out = [...edges];
  const addWalk = (id: string, from: string, to: string) => {
    if (out.some((edge) => edge.id === id)) return;
    const a = nodeById.get(from);
    const b = nodeById.get(to);
    if (!a || !b) return;
    const lengthM = Math.max(5, Math.round(haversineMeters(a.pos, b.pos)));
    out.push({
      id,
      from,
      to,
      kind: "walkway",
      lengthM: lengthM,
      traverseSeconds: Math.max(5, Math.round(lengthM / WALK_MPS)),
      bidirectional: true,
    });
  };
  addWalk("BRI:edge:bridge-curb-main", "curb-main", "BRI:node:curb");
  addWalk("BRI:edge:curb-terminal", "BRI:node:curb", "BRI:node:terminal");
  return out;
}

function assertCuratedPreserved(before: AirportLayout, after: AirportLayout): void {
  for (const id of BRI_CURATED_NODE_IDS) {
    const node = after.nodes.find((n) => n.id === id);
    const expected = before.nodes.find((n) => n.id === id);
    if (!node || !expected) {
      throw new Error(`BRI overlay dropped curated node: ${id}`);
    }
    if (node.pos[0] !== expected.pos[0] || node.pos[1] !== expected.pos[1]) {
      throw new Error(`BRI overlay moved curated node: ${id}`);
    }
  }

  for (const id of BRI_CURATED_EDGE_IDS) {
    const edge = after.edges.find((e) => e.id === id);
    const expected = before.edges.find((e) => e.id === id);
    if (!edge || !expected) {
      throw new Error(`BRI overlay dropped curated edge: ${id}`);
    }
    if (
      edge.traverseSeconds !== expected.traverseSeconds ||
      edge.lengthM !== expected.lengthM
    ) {
      throw new Error(`BRI overlay changed curated edge metrics: ${id}`);
    }
  }

  for (const id of BRI_CURATED_POI_IDS) {
    if (!after.pois.some((p) => p.id === id)) {
      throw new Error(`BRI overlay dropped curated POI: ${id}`);
    }
  }
}

/** Test helper — snapshot curated edge metrics. */
export function curatedBriEdgeSnapshot(layout: AirportLayout): Pick<GraphEdge, "id" | "traverseSeconds" | "lengthM">[] {
  return BRI_CURATED_EDGE_IDS.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}

/** Test helper — curated POI ids present. */
export function curatedBriPoiIds(layout: AirportLayout): PoiDefinition["id"][] {
  return BRI_CURATED_POI_IDS.filter((id) => layout.pois.some((p) => p.id === id));
}

/** Test helper — curated node positions. */
export function curatedBriNodeSnapshot(layout: AirportLayout): Pick<GraphNode, "id" | "pos">[] {
  return BRI_CURATED_NODE_IDS.map((id) => {
    const node = layout.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`missing ${id}`);
    return { id: node.id, pos: node.pos };
  });
}
