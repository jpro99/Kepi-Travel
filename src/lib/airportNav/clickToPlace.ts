/**
 * Admin click-to-place — apply a human-confirmed coordinate to a draft layout.
 * Goes into the existing draft → preview-confirm → publish flow (no second path).
 * Airport-agnostic: works for any layout already in (or addable to) the registry.
 */

import type { AirportLayout, GraphNode, PoiCategory, PoiDefinition } from "./types";

export interface ClickToPlaceInput {
  lng: number;
  lat: number;
  category: PoiCategory;
  name: string;
  airline?: string;
  airlineIataCode?: string;
  doorLabel?: string;
  /**
   * Human-confirmed placements are still approximate for security (M32).
   * Everything else from click-to-place is treated as surveyed (human verified).
   */
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function nodeKindFor(category: PoiCategory): GraphNode["kind"] {
  if (category === "gate") return "gate";
  if (category === "checkin") return "checkin";
  if (category === "security") return "security_entry";
  if (category === "lounge") return "lounge";
  if (category === "restroom") return "restroom";
  if (category === "train") return "train_platform";
  return "landmark";
}

/**
 * Append a new node + POI at the clicked coordinate. Security stays
 * precision:"schematic" (M32); other categories become "surveyed" (human confirmed).
 * Does not auto-publish — caller keeps the result as a draft.
 */
export function applyClickToPlace(layout: AirportLayout, input: ClickToPlaceInput): AirportLayout {
  const name = input.name.trim();
  if (!name) throw new Error("Click-to-place requires a name");
  if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) {
    throw new Error("Click-to-place requires a finite lng/lat");
  }

  const idBase = slug(`${input.category}-${name}-${input.doorLabel ?? ""}`);
  let nodeId = `node-place-${idBase}`;
  let poiId = `poi-place-${idBase}`;
  let n = 1;
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  const poiIds = new Set(layout.pois.map((poi) => poi.id));
  while (nodeIds.has(nodeId)) nodeId = `node-place-${idBase}-${n++}`;
  n = 1;
  while (poiIds.has(poiId)) poiId = `poi-place-${idBase}-${n++}`;

  const isSecurity = input.category === "security";
  const node: GraphNode = {
    id: nodeId,
    pos: [input.lng, input.lat],
    kind: nodeKindFor(input.category),
    // Security entry is landside; most other traveler destinations are airside.
    airside: input.category !== "checkin" && input.category !== "security",
    landmark: name,
  };

  const poi: PoiDefinition = {
    id: poiId,
    nodeId,
    category: input.category,
    name,
    airline: input.airline?.trim() || undefined,
    airlineIataCode: input.airlineIataCode?.trim().toUpperCase() || undefined,
    doorLabel: input.doorLabel?.trim() || undefined,
    precision: isSecurity ? "schematic" : "surveyed",
  };

  return {
    ...layout,
    nodes: [...layout.nodes, node],
    pois: [...layout.pois, poi],
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}
