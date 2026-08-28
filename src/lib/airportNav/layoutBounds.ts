/**
 * Camera framing for the live map. Real OSM-derived footprints are irregular
 * and off-centre, so a fixed center+zoom crops them. Fit to the actual zone
 * geometry instead. Pure + tested so it works for hand-drawn and OSM layouts.
 */

import type { AirportLayout } from "./types";

export type LngLatBounds = [[number, number], [number, number]];

/** Every `train` edge as a coordinate pair — straight chords (satellite people-movers only). */
export function trainEdgeSegmentsFromLayout(layout: AirportLayout): [number, number][][] {
  const pos = new Map(layout.nodes.map((node) => [node.id, node.pos]));
  const segments: [number, number][][] = [];
  for (const edge of layout.edges) {
    if (edge.kind !== "train") continue;
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (a && b) segments.push([a, b]);
  }
  return segments;
}

/**
 * Regional rail corridors from surveyed OSM polylines — replaces crow-flies train edges
 * on the live map (FCO Leonardo Express → Roma Termini).
 */
export function regionalRailLineStringsFromLayout(layout: AirportLayout): [number, number][][] {
  if (layout.regionalRailPolylines?.length) {
    return layout.regionalRailPolylines
      .filter((poly) => poly.coordinates.length >= 2)
      .map((poly) => poly.coordinates);
  }
  return trainEdgeSegmentsFromLayout(layout);
}

/**
 * Camera bounds for arrival first mile when a layout includes regional rail.
 * Frames airport terminal context and every surveyed rail vertex (FCO→Termini corridor).
 */
export function computeRegionalRailBounds(layout: AirportLayout): LngLatBounds | null {
  const lineStrings = regionalRailLineStringsFromLayout(layout);
  if (lineStrings.length === 0) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const consider = (lng: number, lat: number) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };

  for (const line of lineStrings) {
    for (const [lng, lat] of line) consider(lng, lat);
  }

  const terminal = computeLayoutBounds(layout);
  if (terminal) {
    consider(terminal[0][0], terminal[0][1]);
    consider(terminal[1][0], terminal[1][1]);
  }

  if (west === Infinity) return null;
  return [
    [west, south],
    [east, north],
  ];
}

/** [[west, south], [east, north]] covering every zone ring (nodes as fallback). */
export function computeLayoutBounds(layout: AirportLayout): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const consider = (lng: number, lat: number) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };

  for (const zone of layout.zones) {
    for (const [lng, lat] of zone.ring) consider(lng, lat);
  }
  // Fall back to node positions if zones were somehow empty of geometry.
  if (west === Infinity) {
    for (const node of layout.nodes) consider(node.pos[0], node.pos[1]);
  }
  if (west === Infinity) return null;

  return [
    [west, south],
    [east, north],
  ];
}

/**
 * Bounds of the landside terminal building(s) only (airside === false zones).
 * Used to frame the preview camera on the main terminal — where check-in and
 * security are — instead of the whole airfield (which shrinks the terminal and
 * pushes it off toward the parking/satellites). Falls back to the full layout
 * bounds when a layout has no explicit landside zone. See M24.
 */
export function computeLandsideBounds(layout: AirportLayout): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const zone of layout.zones) {
    if (zone.airside) continue;
    for (const [lng, lat] of zone.ring) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }

  if (west === Infinity) return computeLayoutBounds(layout);
  return [
    [west, south],
    [east, north],
  ];
}

/** Approximate span of the layout in meters (max of width/height). */
export function layoutSpanMeters(bounds: LngLatBounds): number {
  const [[west, south], [east, north]] = bounds;
  const midLat = (south + north) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLng = mPerDegLat * Math.cos((midLat * Math.PI) / 180);
  const widthM = (east - west) * mPerDegLng;
  const heightM = (north - south) * mPerDegLat;
  return Math.max(widthM, heightM);
}
