/**
 * Landside access overlay — package-derived OSM access rings + curb walk-in paths.
 *
 * Only surfaces geometry already present in the layout package (KAC zones/edges/nodes).
 * Never invents loops; when the factory export lacks a landside ring, nothing is drawn.
 */

import type { AirportLayout, GraphEdge, GraphNode, TerminalZonePolygon } from "./types";

export interface LandsideAccessOverlayGeoJson {
  /** Closed rings tagged as landside/access in the package (e.g. *:zone:*-landside). */
  accessLoopZones: GeoJSON.FeatureCollection;
  /** Curb → check-in and curb → curb frontage segments from the package graph. */
  accessPaths: GeoJSON.FeatureCollection;
  /** Drop-off curb coordinates (KAC *:node:curb:* and curated curb-* nodes). */
  curbPoints: GeoJSON.FeatureCollection;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Package landside access loop — explicit `-landside` / `:landside` zone id, not terminal footprint. */
export function isPackageLandsideAccessZone(zone: TerminalZonePolygon): boolean {
  if (zone.airside) return false;
  const id = zone.id.toLowerCase();
  if (id.includes("-landside") || id.endsWith(":landside")) return true;
  return false;
}

/** KAC/OSM curb node ids shipped in the factory package or curated first-mile graph. */
export function isPackageCurbNode(node: GraphNode): boolean {
  if (/:node:curb:/.test(node.id)) return true;
  if (/^curb-/.test(node.id)) return true;
  return node.kind === "landmark" && /curb|drop.?off|departures/i.test(node.landmark ?? "");
}

/**
 * Walk-in segments the package already models: curb↔curb frontage and curb→check-in.
 * Does not include security transitions or train hops.
 */
export function isPackageAccessWalkEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>): boolean {
  if (edge.kind !== "walkway") return false;
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return false;

  const fromCurb = isPackageCurbNode(from);
  const toCurb = isPackageCurbNode(to);
  const toCheckin = to.kind === "checkin" || /:node:checkin:/.test(to.id) || /^checkin-/.test(to.id);

  if (fromCurb && (toCurb || toCheckin)) return true;

  const id = edge.id.toLowerCase();
  return id.includes("curb") || id.includes("frontage") || id.includes("landside");
}

export function buildLandsideAccessOverlayGeoJson(layout: AirportLayout): LandsideAccessOverlayGeoJson {
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));

  const accessZones = layout.zones.filter(isPackageLandsideAccessZone);
  const accessLoopZones: GeoJSON.FeatureCollection =
    accessZones.length === 0
      ? EMPTY
      : {
          type: "FeatureCollection",
          features: accessZones.map((zone) => ({
            type: "Feature",
            properties: { id: zone.id, name: zone.name },
            geometry: {
              type: "Polygon",
              coordinates: [zone.ring],
            },
          })),
        };

  const pathEdges = layout.edges.filter((edge) => isPackageAccessWalkEdge(edge, nodeById));
  const accessPaths: GeoJSON.FeatureCollection =
    pathEdges.length === 0
      ? EMPTY
      : {
          type: "FeatureCollection",
          features: pathEdges.flatMap((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return [];
            return [{
              type: "Feature" as const,
              properties: { id: edge.id },
              geometry: {
                type: "LineString" as const,
                coordinates: [from.pos, to.pos],
              },
            }];
          }),
        };

  const curbNodes = layout.nodes.filter(isPackageCurbNode);
  const curbPoints: GeoJSON.FeatureCollection =
    curbNodes.length === 0
      ? EMPTY
      : {
          type: "FeatureCollection",
          features: curbNodes.map((node) => ({
            type: "Feature",
            properties: {
              id: node.id,
              label: node.landmark ?? "Drop-off",
            },
            geometry: {
              type: "Point",
              coordinates: node.pos,
            },
          })),
        };

  return { accessLoopZones: accessLoopZones, accessPaths, curbPoints };
}

/** Zone ids in the raw KAC fixture that were dropped at overlay merge (invalid ring). */
export function listMissingKacLandsideAccessZones(rawKacZones: TerminalZonePolygon[]): string[] {
  return rawKacZones
    .filter(isPackageLandsideAccessZone)
    .map((zone) => zone.id);
}
