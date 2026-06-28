/** Reject coarse Wi‑Fi/cell fixes that pin people blocks away. */
export const MAX_SHARE_ACCURACY_M = 75;

/** Show on map only when fix is reasonably precise. */
export const MAX_DISPLAY_ACCURACY_M = 100;

/** Never accept a fix worse than this — usually a cell/Wi‑Fi guess. */
export const HARD_REJECT_ACCURACY_M = 250;

export interface GeolocationFix {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

let lastGoodFix: GeolocationFix | null = null;

export function resetGeolocationQualityState(): void {
  lastGoodFix = null;
}

function normalizeAccuracy(accuracy?: number): number {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return accuracy;
}

export function shouldAcceptGeolocationFix(
  coords: GeolocationCoordinates,
  timestamp = Date.now(),
): boolean {
  const accuracy = normalizeAccuracy(coords.accuracy);
  if (accuracy > HARD_REJECT_ACCURACY_M) return false;
  if (accuracy <= MAX_SHARE_ACCURACY_M) {
    lastGoodFix = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy,
      timestamp,
    };
    return true;
  }

  // Allow a softer fix only when we have no recent precise reading (GPS still warming up).
  const staleGood =
    !lastGoodFix || timestamp - lastGoodFix.timestamp > 2 * 60_000;
  return staleGood && accuracy <= MAX_DISPLAY_ACCURACY_M;
}

export function shouldDisplayGeolocationFix(accuracy?: number): boolean {
  const normalized = normalizeAccuracy(accuracy);
  if (normalized <= MAX_DISPLAY_ACCURACY_M) return true;
  if (!lastGoodFix) return normalized <= HARD_REJECT_ACCURACY_M;
  return Date.now() - lastGoodFix.timestamp > 2 * 60_000 && normalized <= HARD_REJECT_ACCURACY_M;
}

export function getLastGoodGeolocationFix(): GeolocationFix | null {
  return lastGoodFix;
}
