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
 *
 * M36 — door numbers must increase monotonically along the facade. Mis-tagged
 * OSM entrance refs (real coordinate, wrong ordinal) break the curve silently
 * unless findMonotonicityOutliers flags them before they become anchors.
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

/**
 * KEPI_DESIGN_LAW M36 — detect door anchors whose geographic order breaks the
 * door-number sequence (mis-tagged OSM entrance refs).
 *
 * Projects anchors onto the best-fit line through the set, orients so projection
 * generally increases with door number, then flags any anchor that reverses
 * relative to its immediate neighbors. Airport-agnostic — no hardcoded axis.
 * Returns [] when fewer than 3 anchors (not enough to judge a middle outlier).
 */
export function findMonotonicityOutliers(anchors: DoorAnchor[]): DoorAnchor[] {
  if (anchors.length < 3) return [];

  const sorted = [...anchors].sort((a, b) => a.door - b.door);
  // Dedupe door numbers — keep first; duplicate refs are a separate data problem.
  const unique: DoorAnchor[] = [];
  const seenDoors = new Set<number>();
  for (const a of sorted) {
    if (seenDoors.has(a.door)) continue;
    seenDoors.add(a.door);
    unique.push(a);
  }
  if (unique.length < 3) return [];

  const n = unique.length;
  let meanLng = 0;
  let meanLat = 0;
  for (const a of unique) {
    meanLng += a.lng;
    meanLat += a.lat;
  }
  meanLng /= n;
  meanLat /= n;

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (const a of unique) {
    const dx = a.lng - meanLng;
    const dy = a.lat - meanLat;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  // Principal eigenvector of [[cxx,cxy],[cxy,cyy]] via larger-eigenvalue closed form.
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, (trace * trace) / 4 - det);
  const lambda = trace / 2 + Math.sqrt(disc);
  let axisLng = cxy;
  let axisLat = lambda - cxx;
  if (Math.abs(axisLng) < 1e-18 && Math.abs(axisLat) < 1e-18) {
    axisLng = lambda - cyy;
    axisLat = cxy;
  }
  const axisLen = Math.hypot(axisLng, axisLat);
  if (axisLen < 1e-18) return []; // all points coincident — nothing to judge
  axisLng /= axisLen;
  axisLat /= axisLen;

  const proj = unique.map((a) => (a.lng - meanLng) * axisLng + (a.lat - meanLat) * axisLat);

  // Orient so projection tends to increase with door number.
  let sumDelta = 0;
  for (let i = 1; i < n; i += 1) sumDelta += proj[i] - proj[i - 1];
  if (sumDelta < 0) {
    for (let i = 0; i < n; i += 1) proj[i] = -proj[i];
  }

  // An anchor is an outlier if it sits on the wrong side of either neighbor —
  // i.e. the sequence proj[i-1] ≤ proj[i] ≤ proj[i+1] fails.
  const EPS = 1e-12;
  const outliers: DoorAnchor[] = [];
  for (let i = 0; i < n; i += 1) {
    const prevOk = i === 0 || proj[i] + EPS >= proj[i - 1];
    const nextOk = i === n - 1 || proj[i + 1] + EPS >= proj[i];
    if (!prevOk || !nextOk) outliers.push(unique[i]);
  }
  return outliers;
}
