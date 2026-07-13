/**
 * Camera framing for the live map. Real OSM-derived footprints are irregular
 * and off-centre, so a fixed center+zoom crops them. Fit to the actual zone
 * geometry instead. Pure + tested so it works for hand-drawn and OSM layouts.
 */

import type { AirportLayout } from "./types";

export type LngLatBounds = [[number, number], [number, number]];

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
