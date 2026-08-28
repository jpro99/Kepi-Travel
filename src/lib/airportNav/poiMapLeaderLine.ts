/**
 * Leader-line label geometry — names sit OUTSIDE the terminal hull with collision nudging.
 */

import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import type { TerminalZonePolygon } from "./types";

export interface LeaderLineLayout {
  pinPx: { x: number; y: number };
  labelPx: { x: number; y: number };
  elbowPx: { x: number; y: number };
  labelWidthPx: number;
  labelHeightPx: number;
}

export interface LeaderLabelBox {
  id: string;
  priority: number;
  pinX: number;
  pinY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  elbowX: number;
  elbowY: number;
}

const LABEL_HEIGHT = 28;
const LABEL_PAD_X = 24;
const MIN_OUTSIDE_OFFSET = 96;
const HULL_OUTSIDE_OFFSET = 132;
const REGIONAL_RAIL_OFFSET = 168;

function labelWidthForText(text: string): number {
  return Math.min(340, Math.max(96, text.length * 6.2 + LABEL_PAD_X));
}

function labelHeightForText(text: string, widthPx: number): number {
  const charsPerLine = Math.max(18, Math.floor((widthPx - LABEL_PAD_X) / 6.2));
  const lines = Math.min(3, Math.ceil(text.length / charsPerLine));
  return LABEL_HEIGHT + (lines - 1) * 14;
}

function hullContaining(
  lngLat: [number, number],
  hulls: TerminalZonePolygon[],
): TerminalZonePolygon | null {
  const pt = point(lngLat);
  for (const zone of hulls) {
    if (zone.ring.length < 4) continue;
    try {
      if (booleanPointInPolygon(pt, polygon([zone.ring]))) return zone;
    } catch {
      /* invalid ring */
    }
  }
  return null;
}

function hullCentroidScreen(
  zone: TerminalZonePolygon,
  project: (lngLat: [number, number]) => { x: number; y: number },
): { x: number; y: number } {
  const ring = zone.ring;
  const lng = ring.reduce((sum, pt) => sum + pt[0], 0) / ring.length;
  const lat = ring.reduce((sum, pt) => sum + pt[1], 0) / ring.length;
  return project([lng, lat]);
}

/**
 * Screen-space leader layout: push the label away from the hull centroid through the pin.
 */
export function computeLeaderLineScreenLayout(
  pinScreen: { x: number; y: number },
  labelText: string,
  lngLat: [number, number],
  hulls: TerminalZonePolygon[],
  project: (lngLat: [number, number]) => { x: number; y: number },
  mapWidth: number,
  mapHeight: number,
  spreadIndex = 0,
): LeaderLineLayout {
  const labelWidthPx = labelWidthForText(labelText);
  const labelHeightPx = labelHeightForText(labelText, labelWidthPx);
  const hull = hullContaining(lngLat, hulls);
  let dx = 1;
  let dy = -0.35;
  if (hull) {
    const c = hullCentroidScreen(hull, project);
    dx = pinScreen.x - c.x;
    dy = pinScreen.y - c.y;
    if (spreadIndex > 0) {
      const angle = (spreadIndex * 52 * Math.PI) / 180;
      const baseLen = Math.hypot(dx, dy) || 1;
      const bx = dx / baseLen;
      const by = dy / baseLen;
      dx = bx * Math.cos(angle) - by * Math.sin(angle);
      dy = bx * Math.sin(angle) + by * Math.cos(angle);
    }
  } else if (pinScreen.x > mapWidth * 0.52) {
    dx = -1;
    dy = -0.25;
  } else if (pinScreen.y < mapHeight * 0.35) {
    dx = 0.35;
    dy = 1;
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const offset = hull ? HULL_OUTSIDE_OFFSET + spreadIndex * 28 : REGIONAL_RAIL_OFFSET;
  const labelCx = pinScreen.x + dx * offset;
  const labelCy = pinScreen.y + dy * offset;
  const labelPx = {
    x: labelCx - labelWidthPx / 2,
    y: labelCy - labelHeightPx / 2,
  };
  const elbowPx = {
    x: pinScreen.x + dx * 22,
    y: pinScreen.y + dy * 22,
  };
  return {
    pinPx: pinScreen,
    labelPx,
    elbowPx,
    labelWidthPx,
    labelHeightPx,
  };
}

function boxesOverlap(a: LeaderLabelBox, b: LeaderLabelBox): boolean {
  return !(
    a.x + a.width < b.x
    || b.x + b.width < a.x
    || a.y + a.height < b.y
    || b.y + b.height < a.y
  );
}

function clampBoxToViewport(box: LeaderLabelBox, mapWidth: number, mapHeight: number): void {
  const margin = 6;
  if (box.x < margin) box.x = margin;
  if (box.y < margin) box.y = margin;
  if (box.x + box.width > mapWidth - margin) box.x = mapWidth - margin - box.width;
  if (box.y + box.height > mapHeight - margin) box.y = mapHeight - margin - box.height;
}

/**
 * Nudge lower-priority labels until no pair overlaps (CEO: unreadable = reject).
 */
export function resolveLeaderLabelCollisions(
  boxes: LeaderLabelBox[],
  mapWidth: number,
  mapHeight: number,
): LeaderLabelBox[] {
  const sorted = [...boxes].sort((a, b) => b.priority - a.priority);
  const placed: LeaderLabelBox[] = [];

  for (const candidate of sorted) {
    const box = { ...candidate };
    clampBoxToViewport(box, mapWidth, mapHeight);

    for (let attempt = 0; attempt < 36; attempt += 1) {
      const hit = placed.find((other) => boxesOverlap(box, other));
      if (!hit) break;
      const angle = (attempt * 38 * Math.PI) / 180;
      box.x += Math.cos(angle) * 34;
      box.y += Math.sin(angle) * 28;
      clampBoxToViewport(box, mapWidth, mapHeight);
    }
    placed.push(box);
  }
  return placed;
}

export function layoutToLabelBox(
  id: string,
  priority: number,
  layout: LeaderLineLayout,
): LeaderLabelBox {
  return {
    id,
    priority,
    pinX: layout.pinPx.x,
    pinY: layout.pinPx.y,
    x: layout.labelPx.x,
    y: layout.labelPx.y,
    width: layout.labelWidthPx,
    height: layout.labelHeightPx,
    elbowX: layout.elbowPx.x,
    elbowY: layout.elbowPx.y,
  };
}
