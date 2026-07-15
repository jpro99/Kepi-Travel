/**
 * 2D control-point georeferencing (master prompt §6 / M27 generalization).
 *
 * Given matched pairs of (reference-image pixel → real world lng/lat), estimate
 * an affine transform and project other labeled pixels into draft coordinates.
 * Estimates are always precision "schematic" (or "extrapolated" outside the
 * convex hull of anchors) until human click-to-place confirmation.
 *
 * This never reads a competitor's coordinate — only Kepi's verified anchors and
 * pixel positions from a public reference image.
 */

export interface PixelWorldPair {
  /** Image pixel [x, y] (origin top-left). */
  pixel: [number, number];
  /** Real-world [lng, lat] from a verified Kepi/OSM anchor. */
  world: [number, number];
}

/** Affine: world = A * pixel + b  (2×2 matrix + 2-vector). */
export interface AffineTransform {
  a00: number;
  a01: number;
  a10: number;
  a11: number;
  b0: number;
  b1: number;
}

export type TransformGrade = "schematic" | "extrapolated";

/** Solve 3×3 system Mx = rhs via Gaussian elimination. Returns null if singular. */
function solve3(mIn: number[][], rhsIn: number[]): [number, number, number] | null {
  const m = mIn.map((row) => [...row]);
  const rhs = [...rhsIn];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }
    const div = m[col][col];
    for (let j = col; j < 3; j++) m[col][j] /= div;
    rhs[col] /= div;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j < 3; j++) m[row][j] -= factor * m[col][j];
      rhs[row] -= factor * rhs[col];
    }
  }
  return [rhs[0], rhs[1], rhs[2]];
}

/**
 * Least-squares affine fit from ≥3 control pairs.
 * Returns null if the system is under-determined or singular.
 */
export function estimateAffineTransform(pairs: PixelWorldPair[]): AffineTransform | null {
  if (pairs.length < 3) return null;
  // Normal equations for each axis: [x y 1] · [a0 a1 b]^T ≈ world
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0;
  let sxLng = 0, syLng = 0, sLng = 0;
  let sxLat = 0, syLat = 0, sLat = 0;
  for (const p of pairs) {
    const x = p.pixel[0];
    const y = p.pixel[1];
    const lng = p.world[0];
    const lat = p.world[1];
    sxx += x * x;
    sxy += x * y;
    sx += x;
    syy += y * y;
    sy += y;
    n += 1;
    sxLng += x * lng;
    syLng += y * lng;
    sLng += lng;
    sxLat += x * lat;
    syLat += y * lat;
    sLat += lat;
  }
  const ata = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const lngFit = solve3(ata, [sxLng, syLng, sLng]);
  const latFit = solve3(ata, [sxLat, syLat, sLat]);
  if (!lngFit || !latFit) return null;
  return {
    a00: lngFit[0],
    a01: lngFit[1],
    b0: lngFit[2],
    a10: latFit[0],
    a11: latFit[1],
    b1: latFit[2],
  };
}

export function applyAffine(t: AffineTransform, pixel: [number, number]): [number, number] {
  const [x, y] = pixel;
  return [t.a00 * x + t.a01 * y + t.b0, t.a10 * x + t.a11 * y + t.b1];
}

/** Point-in-convex-hull of world anchors (simple cross-product winding). */
export function isInsideAnchorHull(
  point: [number, number],
  anchors: [number, number][],
): boolean {
  if (anchors.length < 3) return false;
  const hull = convexHull(anchors);
  if (hull.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < 1e-15) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (pts.length <= 1) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Project a reference-image pixel through the affine transform and grade it.
 * Outside the convex hull of world anchors → "extrapolated" (lower confidence).
 */
export function projectReferencePixel(
  transform: AffineTransform,
  pixel: [number, number],
  worldAnchors: [number, number][],
): { pos: [number, number]; grade: TransformGrade } {
  const pos = applyAffine(transform, pixel);
  const grade: TransformGrade = isInsideAnchorHull(pos, worldAnchors) ? "schematic" : "extrapolated";
  return { pos, grade };
}
