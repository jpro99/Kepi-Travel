/**
 * FCO KAC overlay — thin wrapper over generalized applyKacOverlay.
 */

import type { AirportLayout, GraphEdge, PoiDefinition } from "../types";
import { applyKacOverlay } from "./applyKacOverlay";
import {
  FCO_CURATED_FIRST_MILE_EDGE_IDS,
  FCO_CURATED_FIRST_MILE_NODE_IDS,
  FCO_CURATED_FIRST_MILE_POI_IDS,
} from "./fcoFirstMileGuards";
import type { CuratedGraphGuards } from "./curatedGraphGuards";

const FCO_GUARDS: CuratedGraphGuards = {
  nodeIds: FCO_CURATED_FIRST_MILE_NODE_IDS,
  edgeIds: FCO_CURATED_FIRST_MILE_EDGE_IDS,
  poiIds: FCO_CURATED_FIRST_MILE_POI_IDS,
};

export type FcoKacOverlayResult = ReturnType<typeof applyFcoKacOverlay>;

export function applyFcoKacOverlay(curated: AirportLayout, kacLayout: AirportLayout) {
  if (curated.iata !== "FCO" || kacLayout.iata !== "FCO") {
    throw new Error("applyFcoKacOverlay is FCO-only");
  }

  const result = applyKacOverlay(curated, kacLayout, FCO_GUARDS, {
    unroutedGatePoiIdPrefix: "poi:FCO:node:gate:",
  });

  return {
    layout: { ...result.layout, routeGrade: "schematic" as const },
    stats: {
      zonesAdded: result.stats.zonesAdded,
      gateNodesAdded: result.stats.gateNodesAdded,
      schematicNodesAdded: result.stats.schematicNodesAdded,
      edgesAdded: result.stats.edgesAdded,
      gatePoisAdded: result.stats.gatePoisAdded,
      skippedDuplicateGroundTransport: result.stats.skippedDuplicateGroundTransport,
    },
  };
}

export function curatedFirstMileEdgeSnapshot(
  layout: AirportLayout,
): Pick<GraphEdge, "id" | "traverseSeconds" | "lengthM">[] {
  return FCO_CURATED_FIRST_MILE_EDGE_IDS.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}

export function curatedFirstMilePoiIds(layout: AirportLayout): PoiDefinition["id"][] {
  return FCO_CURATED_FIRST_MILE_POI_IDS.filter((id) => layout.pois.some((p) => p.id === id));
}
