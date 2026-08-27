/**
 * Leader-line label geometry for walk-map pins — label sits outside the terminal hull.
 */

import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import type { TerminalZonePolygon } from "./types";

export interface LeaderLineLayout {
  /** Pin dot at origin (0,0) in marker element space. */
  pinPx: { x: number; y: number };
  /** Label box top-left in marker element space. */
  labelPx: { x: number; y: number };
  elbowPx: { x: number; y: number };
  labelWidthPx: number;
  labelHeightPx: number;
  placeLeft: boolean;
}

function isInsideAnyHull(lngLat: [number, number], hulls: TerminalZonePolygon[]): boolean {
  const pt = point(lngLat);
  return hulls.some((zone) => {
    if (zone.ring.length < 4) return false;
    try {
      return booleanPointInPolygon(pt, polygon([zone.ring]));
    } catch {
      return false;
    }
  });
}

/**
 * Pixel layout for a leader-line marker anchored at the POI coordinate.
 * Pushes the label away from the hull when the pin sits inside a terminal zone.
 */
export function computeLeaderLineLayout(
  mapWidth: number,
  mapHeight: number,
  projectedPin: { x: number; y: number },
  labelText: string,
  lngLat: [number, number],
  hulls: TerminalZonePolygon[],
): LeaderLineLayout {
  const placeLeft = projectedPin.x > mapWidth * 0.52;
  const insideHull = hulls.length > 0 && isInsideAnyHull(lngLat, hulls);
  const baseOffset = insideHull ? 118 : 88;
  const labelWidthPx = Math.min(168, Math.max(72, labelText.length * 6.2 + 24));
  const labelHeightPx = 26;
  const pinPx = { x: 0, y: 0 };
  const labelPx = {
    x: placeLeft ? -baseOffset - labelWidthPx : baseOffset,
    y: -labelHeightPx - 10,
  };
  const elbowPx = {
    x: placeLeft ? labelPx.x + labelWidthPx + 4 : labelPx.x - 4,
    y: -6,
  };
  return {
    pinPx,
    labelPx,
    elbowPx,
    labelWidthPx,
    labelHeightPx,
    placeLeft,
  };
}
