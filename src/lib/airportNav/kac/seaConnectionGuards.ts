/**
 * SEA curated connection + first-mile graph — overlay must preserve.
 * Includes footway overlay output (SEA_LAYOUT live).
 */

import type { AirportLayout } from "../types";
import { guardsFromLayout, type CuratedGraphGuards } from "./curatedGraphGuards";
import { SEA_LAYOUT } from "../layouts/sea";

export const SEA_CURATED_GUARDS: CuratedGraphGuards = guardsFromLayout(SEA_LAYOUT);

export function isSeaCuratedNodeId(id: string): boolean {
  return SEA_CURATED_GUARDS.nodeIds.includes(id);
}

export function isSeaCuratedEdgeId(id: string): boolean {
  return SEA_CURATED_GUARDS.edgeIds.includes(id);
}

export function isSeaCuratedPoiId(id: string): boolean {
  return SEA_CURATED_GUARDS.poiIds.includes(id);
}

export function seaCuratedEdgeSnapshot(
  layout: AirportLayout,
): Array<{ id: string; traverseSeconds: number; lengthM: number }> {
  return SEA_CURATED_GUARDS.edgeIds.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}
