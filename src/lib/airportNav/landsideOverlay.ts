/**
 * Landside overlay geometry from KAC compiler packages — terminal hulls are
 * already drawn as zones; this module surfaces optional OSM access-loop rings
 * and curb drop-off anchors when (and only when) the package carries them.
 *
 * Convention (Cartographer): access loops are separate landside zones whose id
 * ends with `:zone:access` or `:zone:access-loop`. Curb anchors use
 * `:node:curb` ids. Never invent geometry that is not in the layout.
 */

import type { AirportLayout, GraphNode, TerminalZonePolygon } from "./types";

/** KAC compiler zone ids use the `IATA:zone:…` namespace. */
const KAC_ZONE_ID_RE = /^[A-Z]{3}:zone:/;

/** OSM access-loop ring when Cartographer emits it as its own zone. */
const ACCESS_LOOP_ZONE_ID_RE = /:zone:access(?:-loop)?$/i;

export interface LandsideOverlayGeometry {
  /** KAC terminal building hulls (landside `:zone:` rings, excluding access loops). */
  terminalHulls: TerminalZonePolygon[];
  /** OSM access-loop rings — empty when the package has none. */
  accessLoops: TerminalZonePolygon[];
  /** Surveyed/schematic curb drop-off anchors (e.g. `BRI:node:curb`). */
  curbNodes: GraphNode[];
}

export function isKacZone(zone: TerminalZonePolygon): boolean {
  return KAC_ZONE_ID_RE.test(zone.id);
}

export function isAccessLoopZone(zone: TerminalZonePolygon): boolean {
  if (zone.airside) return false;
  if (ACCESS_LOOP_ZONE_ID_RE.test(zone.id)) return true;
  return /\baccess\s*loop\b/i.test(zone.name);
}

export function isKacTerminalHullZone(zone: TerminalZonePolygon): boolean {
  return isKacZone(zone) && !zone.airside && !isAccessLoopZone(zone);
}

export function isCurbOverlayNode(node: GraphNode): boolean {
  if (node.airside) return false;
  // Cartographer curb anchors — e.g. BRI:node:curb. Do not infer from landmarks.
  return /:node:curb$/i.test(node.id);
}

/** Extract optional landside overlay pieces already present in a layout. */
export function extractLandsideOverlayGeometry(layout: AirportLayout): LandsideOverlayGeometry {
  const accessLoops = layout.zones.filter(isAccessLoopZone);
  const terminalHulls = layout.zones.filter(isKacTerminalHullZone);
  const curbNodes = layout.nodes.filter(isCurbOverlayNode);
  return { terminalHulls, accessLoops, curbNodes };
}

export function buildLandsideOverlayGeoJson(layout: AirportLayout): {
  accessLoop: GeoJSON.FeatureCollection;
  curb: GeoJSON.FeatureCollection;
  terminalHull: GeoJSON.FeatureCollection;
} {
  const { accessLoops, curbNodes, terminalHulls } = extractLandsideOverlayGeometry(layout);
  return {
    accessLoop: {
      type: "FeatureCollection",
      features: accessLoops.map((zone) => ({
        type: "Feature",
        properties: { id: zone.id, name: zone.name },
        geometry: { type: "LineString", coordinates: zone.ring },
      })),
    },
    curb: {
      type: "FeatureCollection",
      features: curbNodes.map((node) => ({
        type: "Feature",
        properties: { id: node.id, name: node.landmark ?? node.id },
        geometry: { type: "Point", coordinates: node.pos },
      })),
    },
    terminalHull: {
      type: "FeatureCollection",
      features: terminalHulls.map((zone) => ({
        type: "Feature",
        properties: { id: zone.id, name: zone.name },
        geometry: { type: "Polygon", coordinates: [zone.ring] },
      })),
    },
  };
}
