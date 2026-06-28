import { haversineMeters } from "@/lib/geo/haversineMeters";

/** Reject coarse Wi‑Fi/cell fixes that pin people blocks away. */
export const MAX_SHARE_ACCURACY_M = 50;

/** Show on map only when fix is reasonably precise. */
export const MAX_DISPLAY_ACCURACY_M = 65;

/** Never accept a fix worse than this — usually a cell/Wi‑Fi guess. */
export const HARD_REJECT_ACCURACY_M = 120;

/** Reject jumps larger than this unless the new reading is very precise. */
export const MAX_TELEPORT_M = 150;

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

function isTeleportFromLastGood(
  coords: GeolocationCoordinates,
  accuracy: number,
): boolean {
  if (!lastGoodFix) return false;
  const ageMs = Date.now() - lastGoodFix.timestamp;
  if (ageMs > 20 * 60_000) return false;

  const jumpM = haversineMeters(
    lastGoodFix.lat,
    lastGoodFix.lon,
    coords.latitude,
    coords.longitude,
  );
  const allowedDrift = Math.max(lastGoodFix.accuracy, accuracy, 25) * 2.5;
  if (jumpM <= allowedDrift) return false;

  // Large jump with mediocre accuracy = Wi‑Fi/cell mis-pin (e.g. park blocks away).
  if (jumpM > MAX_TELEPORT_M && accuracy > 30) return true;
  return jumpM > allowedDrift + 80 && accuracy >= lastGoodFix.accuracy;
}

export function shouldAcceptGeolocationFix(
  coords: GeolocationCoordinates,
  timestamp = Date.now(),
): boolean {
  const accuracy = normalizeAccuracy(coords.accuracy);
  if (accuracy > HARD_REJECT_ACCURACY_M) return false;
  if (isTeleportFromLastGood(coords, accuracy)) return false;

  if (accuracy <= MAX_SHARE_ACCURACY_M) {
    lastGoodFix = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy,
      timestamp,
    };
    return true;
  }

  const staleGood = !lastGoodFix || timestamp - lastGoodFix.timestamp > 90_000;
  if (staleGood && accuracy <= MAX_DISPLAY_ACCURACY_M) {
    lastGoodFix = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy,
      timestamp,
    };
    return true;
  }

  return false;
}

export function shouldDisplayGeolocationFix(accuracy?: number): boolean {
  const normalized = normalizeAccuracy(accuracy);
  if (normalized <= MAX_DISPLAY_ACCURACY_M) return true;
  if (lastGoodFix && Date.now() - lastGoodFix.timestamp < 20 * 60_000) return false;
  return normalized <= HARD_REJECT_ACCURACY_M;
}

export function getLastGoodGeolocationFix(): GeolocationFix | null {
  return lastGoodFix;
}

/** Prefer the last precise fix when a new coarse reading arrives. */
export function resolveLiveCoordinates(
  coords: GeolocationCoordinates,
  timestamp = Date.now(),
): { lat: number; lon: number; accuracy: number } | null {
  if (shouldAcceptGeolocationFix(coords, timestamp)) {
    return {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy ?? MAX_SHARE_ACCURACY_M,
    };
  }
  if (lastGoodFix && Date.now() - lastGoodFix.timestamp < 30 * 60_000) {
    return {
      lat: lastGoodFix.lat,
      lon: lastGoodFix.lon,
      accuracy: lastGoodFix.accuracy,
    };
  }
  return null;
}
