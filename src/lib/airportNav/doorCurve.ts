/**
 * Curve-calibrated door interpolation (KEPI_DESIGN_LAW M27).
 *
 * Georeferencing-by-control-points: given a handful of REAL, survey-grade door
 * coordinates along a terminal's ticketing facade (SEA's are OSM `entrance` nodes
 * with real `ref` numbers, pulled via Overpass), fit a curve through them and
 * interpolate the real-world position of any other door number along that same
 * curve — ordered by door number. This is how real cartography extends known
 * control points into a full map; it is a *calibrated estimate*, not a guess,
 * because it is anchored to real survey points.
 *
 * HONESTY: the result carries a `grade` so the distinction never blurs —
 *   - "surveyed"     : exactly a known anchor door (real coordinate).
 *   - "schematic"    : interpolated BETWEEN two anchors (calibrated estimate).
 *   - "extrapolated" : outside the anchor span (lower confidence — flag it).
 * A piecewise-linear fit is used (simple, and accurate enough between closely-
 * spaced anchors on a gently-curving facade); no spline needed.
 */

export type DoorPrecision = "surveyed" | "schematic" | "extrapolated";

export interface DoorAnchor {
  door: number;
  lng: number;
  lat: number;
}

export interface DoorPosition {
  pos: [number, number];
  grade: DoorPrecision;
}

function lerpByDoor(a: DoorAnchor, b: DoorAnchor, door: number): [number, number] {
  const t = (door - a.door) / (b.door - a.door);
  return [a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t];
}

/**
 * Real-world [lng, lat] for `door` interpolated along the anchor curve.
 * Anchors need not be pre-sorted. Requires >= 2 anchors.
 */
export function interpolateDoorPosition(anchors: DoorAnchor[], door: number): DoorPosition {
  if (anchors.length < 2) {
    throw new Error("interpolateDoorPosition needs at least 2 anchor doors");
  }
  const sorted = [...anchors].sort((a, b) => a.door - b.door);

  const exact = sorted.find((a) => a.door === door);
  if (exact) return { pos: [exact.lng, exact.lat], grade: "surveyed" };

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Below the anchor span — extrapolate from the two southernmost anchors.
  if (door < first.door) {
    return { pos: lerpByDoor(sorted[0], sorted[1], door), grade: "extrapolated" };
  }
  // Above the anchor span — extrapolate from the two northernmost anchors.
  if (door > last.door) {
    return {
      pos: lerpByDoor(sorted[sorted.length - 2], sorted[sorted.length - 1], door),
      grade: "extrapolated",
    };
  }

  // Between two anchors — interpolate (calibrated estimate).
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (door >= sorted[i].door && door <= sorted[i + 1].door) {
      return { pos: lerpByDoor(sorted[i], sorted[i + 1], door), grade: "schematic" };
    }
  }
  // Unreachable given the span checks above, but keep TS happy.
  return { pos: [last.lng, last.lat], grade: "surveyed" };
}
