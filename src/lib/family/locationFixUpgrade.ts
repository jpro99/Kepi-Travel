import { haversineMeters } from "@/lib/geo/haversineMeters";

export interface LocationFixPoint {
  lat: number;
  lon: number;
  accuracy?: number;
}

/** Unknown accuracy is treated as coarse — do not lock the map on it. */
export function effectiveAccuracyMeters(accuracy?: number): number {
  if (typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0) {
    return accuracy;
  }
  return 999;
}

/** Precise enough to publish as a first pin. */
export const MIN_BOOTSTRAP_ACCURACY_M = 65;

/** Precise enough to override a stale coarse pin even after a large jump. */
export const PRECISE_FIX_ACCURACY_M = 40;

/**
 * Prefer an incoming fix over a stored one when it is clearly more trustworthy,
 * even if coordinates jumped (common when Wi‑Fi mis-pins then GPS corrects).
 */
export function shouldPreferIncomingLocationFix(
  prev: LocationFixPoint,
  incoming: LocationFixPoint,
): boolean {
  const prevAcc = effectiveAccuracyMeters(prev.accuracy);
  const incAcc = effectiveAccuracyMeters(incoming.accuracy);
  const jumpM = haversineMeters(prev.lat, prev.lon, incoming.lat, incoming.lon);

  if (incAcc <= PRECISE_FIX_ACCURACY_M) return true;
  if (jumpM <= 35) return true;
  if (incAcc + 15 < prevAcc) return true;
  if (incAcc <= 55 && prevAcc >= 80) return true;

  return false;
}

/** Safe to show on the map without holding an older mis-pin. */
export function shouldAllowMapJump(
  prev: LocationFixPoint,
  incoming: LocationFixPoint,
  jumpM: number,
): boolean {
  if (jumpM <= 150) return true;
  return shouldPreferIncomingLocationFix(prev, incoming);
}
