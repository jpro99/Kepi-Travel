/**
 * Phase 2 — compass-heading direction arrow + tap-to-confirm position.
 *
 * The standout wayfinding idea: point an on-screen arrow the way the traveler
 * is *actually facing* (using the phone compass), not a line they must mentally
 * rotate. Pure + framework-free so it unit-tests and runs identically wherever.
 *
 * Honesty (KEPI_DESIGN_LAW M16): when compass heading is unavailable we say so
 * and fall back to a north-up bearing arrow — we never pretend to know facing.
 */

import type { ComputedRoute, GraphNode, SnappedPosition } from "./types";

const EARTH_M_PER_DEG_LAT = 111_320;

export function bearingDegrees(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Normalize any angle to (-180, 180]. */
export function normalizeSigned(deg: number): number {
  const wrapped = ((deg % 360) + 540) % 360; // 0..360
  return wrapped - 180 === -180 ? 180 : wrapped - 180;
}

/** The next graph node the traveler should walk toward along a route. */
export function nextRouteTarget(
  route: ComputedRoute,
  currentNodeId: string | null,
): { nodeId: string; pos: [number, number] } | null {
  if (route.nodeIds.length === 0 || route.coordinates.length === 0) return null;
  const lastIdx = route.nodeIds.length - 1;
  let idx = currentNodeId ? route.nodeIds.indexOf(currentNodeId) : -1;
  // Unknown / off-route → aim at the first waypoint. Otherwise aim at the next.
  const targetIdx = idx < 0 ? Math.min(1, lastIdx) : Math.min(idx + 1, lastIdx);
  const pos = route.coordinates[Math.min(targetIdx, route.coordinates.length - 1)];
  return pos ? { nodeId: route.nodeIds[targetIdx], pos } : null;
}

export interface DirectionArrowState {
  /** On-screen rotation in degrees, 0 = arrow points to top of screen. */
  rotationDeg: number;
  /** Absolute compass bearing from the traveler to the next target. */
  bearingDeg: number;
  /** True when a real device heading drove the rotation (facing-aware). */
  headingKnown: boolean;
  /** Straight-line meters to the next target. */
  distanceM: number;
  /** Short spoken/written cue relative to travel direction. */
  cue: string;
}

/** Turn cue from a signed relative angle (-180..180], 0 = dead ahead. */
export function describeTurnCue(relativeDeg: number): string {
  const a = normalizeSigned(relativeDeg);
  const abs = Math.abs(a);
  if (abs <= 20) return "Straight ahead";
  const side = a > 0 ? "right" : "left";
  if (abs <= 55) return `Bear ${side}`;
  if (abs <= 120) return `Turn ${side}`;
  if (abs < 160) return `Sharp ${side}`;
  return "Turn around";
}

/**
 * Compute the arrow. `headingDeg` is the phone compass heading (0 = north,
 * clockwise), or null when the compass is unavailable/denied.
 */
export function computeDirectionArrow(input: {
  userPos: [number, number];
  route: ComputedRoute;
  currentNodeId: string | null;
  headingDeg: number | null;
  targetLandmark?: string | null;
}): DirectionArrowState | null {
  const target = nextRouteTarget(input.route, input.currentNodeId);
  if (!target) return null;
  const bearing = bearingDegrees(input.userPos, target.pos);
  const distanceM = Math.round(metersBetween(input.userPos, target.pos));
  const headingKnown = input.headingDeg != null && Number.isFinite(input.headingDeg);

  if (!headingKnown) {
    const toward = input.targetLandmark ? `Head toward ${input.targetLandmark}` : "Follow the highlighted path";
    return { rotationDeg: bearing, bearingDeg: bearing, headingKnown: false, distanceM, cue: toward };
  }

  const relative = normalizeSigned(bearing - (input.headingDeg as number));
  return {
    rotationDeg: relative,
    bearingDeg: bearing,
    headingKnown: true,
    distanceM,
    cue: describeTurnCue(relative),
  };
}

/**
 * Tap-to-confirm "I'm here": turn a tapped node into a high-confidence snapped
 * position. positionFusion already grants user_confirmed the top confidence
 * grade (0.95+); this is just the deterministic snap the gesture produces.
 */
export function confirmedSnappedPosition(node: GraphNode): SnappedPosition {
  return {
    pos: node.pos,
    nearestNodeId: node.id,
    offGraphMeters: 0,
    confidence: 0.97,
  };
}
