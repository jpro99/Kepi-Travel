import { haversineMeters } from "@/lib/geo/haversineMeters";

/** Prefer precise fixes but allow typical phone GPS indoors. */
export const MAX_SHARE_ACCURACY_M = 100;

/** Show on map when accuracy is reasonable or unknown. */
export const MAX_DISPLAY_ACCURACY_M = 150;

/** Reject only obvious cell/Wi‑Fi mis-pins. */
export const HARD_REJECT_ACCURACY_M = 250;

/** Reject jumps larger than this unless the new reading is very precise. */
export const MAX_TELEPORT_M = 200;

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

function normalizeAccuracy(accuracy?: number): number | null {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 0) {
    return null;
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
  const allowedDrift = Math.max(lastGoodFix.accuracy, accuracy, 40) * 2.5;
  if (jumpM <= allowedDrift) return false;

  if (jumpM > MAX_TELEPORT_M && accuracy > 45) return true;
  return jumpM > allowedDrift + 100 && accuracy >= lastGoodFix.accuracy;
}

function rememberFix(
  coords: GeolocationCoordinates,
  timestamp: number,
  accuracy: number,
): void {
  lastGoodFix = {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracy,
    timestamp,
  };
}

export function shouldAcceptGeolocationFix(
  coords: GeolocationCoordinates,
  timestamp = Date.now(),
): boolean {
  const accuracy = normalizeAccuracy(coords.accuracy);

  // Bootstrap — always accept the first reading unless it is absurdly coarse.
  if (!lastGoodFix) {
    if (accuracy == null || accuracy <= HARD_REJECT_ACCURACY_M) {
      rememberFix(coords, timestamp, accuracy ?? MAX_SHARE_ACCURACY_M);
      return true;
    }
    return false;
  }

  if (accuracy == null) {
    rememberFix(coords, timestamp, lastGoodFix.accuracy);
    return true;
  }

  if (accuracy > HARD_REJECT_ACCURACY_M) return false;
  if (isTeleportFromLastGood(coords, accuracy)) return false;

  if (accuracy <= MAX_SHARE_ACCURACY_M) {
    rememberFix(coords, timestamp, accuracy);
    return true;
  }

  const staleGood = timestamp - lastGoodFix.timestamp > 90_000;
  if (staleGood && accuracy <= MAX_DISPLAY_ACCURACY_M) {
    rememberFix(coords, timestamp, accuracy);
    return true;
  }

  return false;
}

export function shouldDisplayGeolocationFix(accuracy?: number): boolean {
  const normalized = normalizeAccuracy(accuracy);
  if (normalized == null) return true;
  if (normalized <= MAX_DISPLAY_ACCURACY_M) return true;
  if (lastGoodFix && Date.now() - lastGoodFix.timestamp < 20 * 60_000) {
    return normalized <= HARD_REJECT_ACCURACY_M;
  }
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
      accuracy: normalizeAccuracy(coords.accuracy) ?? lastGoodFix?.accuracy ?? MAX_SHARE_ACCURACY_M,
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
