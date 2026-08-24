/**
 * ONT curated depart first-mile + connection graph — overlay must preserve.
 */

import type { AirportLayout } from "../types";
import { guardsFromLayout, type CuratedGraphGuards } from "./curatedGraphGuards";
import { ONT_LAYOUT } from "../layouts/ont";

export const ONT_CURATED_GUARDS: CuratedGraphGuards = guardsFromLayout(ONT_LAYOUT);

export function isOntCuratedNodeId(id: string): boolean {
  return ONT_CURATED_GUARDS.nodeIds.includes(id);
}

export function isOntCuratedEdgeId(id: string): boolean {
  return ONT_CURATED_GUARDS.edgeIds.includes(id);
}

export function isOntCuratedPoiId(id: string): boolean {
  return ONT_CURATED_GUARDS.poiIds.includes(id);
}

export function ontCuratedEdgeSnapshot(
  layout: AirportLayout,
): Array<{ id: string; traverseSeconds: number; lengthM: number }> {
  return ONT_CURATED_GUARDS.edgeIds.map((id) => {
    const edge = layout.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`missing ${id}`);
    return { id: edge.id, traverseSeconds: edge.traverseSeconds, lengthM: edge.lengthM };
  });
}
