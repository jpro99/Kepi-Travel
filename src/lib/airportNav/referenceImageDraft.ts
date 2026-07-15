/**
 * Apply control-point projections from a public reference image into a draft
 * layout (master prompt §6). Positions are schematic/extrapolated only — never
 * auto-surveyed; human click-to-place confirm remains the path to surveyed.
 */

import type { AirportLayout, GraphNode, PoiCategory, PoiDefinition } from "./types";
import {
  estimateAffineTransform,
  projectReferencePixel,
  type AffineTransform,
  type PixelWorldPair,
} from "./controlPointTransform";

export interface ReferenceImageFeature {
  /** Pixel on the reference image (origin top-left). */
  pixel: [number, number];
  name: string;
  category: PoiCategory;
  airline?: string;
  airlineIataCode?: string;
  doorLabel?: string;
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

export function buildAffineFromControlPairs(pairs: PixelWorldPair[]): AffineTransform | null {
  return estimateAffineTransform(pairs);
}

/**
 * Append projected features as draft POIs. Security stays schematic (M32);
 * everything else is schematic/extrapolated from the transform grade.
 */
export function applyReferenceImageDraft(
  layout: AirportLayout,
  transform: AffineTransform,
  worldAnchors: [number, number][],
  features: ReferenceImageFeature[],
): AirportLayout {
  if (features.length === 0) return layout;

  let nodes = [...layout.nodes];
  let pois = [...layout.pois];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const poiIds = new Set(pois.map((p) => p.id));

  for (const feature of features) {
    const name = feature.name.trim();
    if (!name) continue;
    const { pos, grade } = projectReferencePixel(transform, feature.pixel, worldAnchors);
    const isSecurity = feature.category === "security";
    const precision = isSecurity ? "schematic" as const : grade;

    const idBase = slug(`ref-${feature.category}-${name}-${feature.doorLabel ?? ""}`);
    let nodeId = `node-ref-${idBase}`;
    let poiId = `poi-ref-${idBase}`;
    let n = 1;
    while (nodeIds.has(nodeId)) nodeId = `node-ref-${idBase}-${n++}`;
    n = 1;
    while (poiIds.has(poiId)) poiId = `poi-ref-${idBase}-${n++}`;
    nodeIds.add(nodeId);
    poiIds.add(poiId);

    const node: GraphNode = {
      id: nodeId,
      pos,
      kind: nodeKindFor(feature.category),
      airside: feature.category !== "checkin" && feature.category !== "security",
      landmark: name,
    };
    const poi: PoiDefinition = {
      id: poiId,
      nodeId,
      category: feature.category,
      name,
      airline: feature.airline?.trim() || undefined,
      airlineIataCode: feature.airlineIataCode?.trim().toUpperCase() || undefined,
      doorLabel: feature.doorLabel?.trim() || undefined,
      precision,
      minZoomToShow: feature.category === "checkin" ? 15 : undefined,
    };
    nodes = [...nodes, node];
    pois = [...pois, poi];
  }

  return { ...layout, nodes, pois };
}
