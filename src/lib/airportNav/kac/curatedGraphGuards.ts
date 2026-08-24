/**
 * Curated graph guard sets — overlay must never replace these nodes/edges/POIs.
 */

export interface CuratedGraphGuards {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly poiIds: readonly string[];
}

export function isCuratedNodeId(guards: CuratedGraphGuards, id: string): boolean {
  return guards.nodeIds.includes(id);
}

export function isCuratedEdgeId(guards: CuratedGraphGuards, id: string): boolean {
  return guards.edgeIds.includes(id);
}

export function isCuratedPoiId(guards: CuratedGraphGuards, id: string): boolean {
  return guards.poiIds.includes(id);
}

export function guardsFromLayout(layout: {
  nodes: { id: string }[];
  edges: { id: string }[];
  pois: { id: string }[];
}): CuratedGraphGuards {
  return {
    nodeIds: layout.nodes.map((n) => n.id),
    edgeIds: layout.edges.map((e) => e.id),
    poiIds: layout.pois.map((p) => p.id),
  };
}
