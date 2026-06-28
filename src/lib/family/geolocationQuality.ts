import { haversineMeters } from "@/lib/geo/haversineMeters";
import {
  MIN_BOOTSTRAP_ACCURACY_M,
  PRECISE_FIX_ACCURACY_M,
  shouldPreferIncomingLocationFix,
} from "@/lib/family/locationFixUpgrade";

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

  const incoming = {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracy,
  };
  const prev = {
    lat: lastGoodFix.lat,
    lon: lastGoodFix.lon,
    accuracy: lastGoodFix.accuracy,
  };
  if (shouldPreferIncomingLocationFix(prev, incoming)) return false;

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

  // Bootstrap — wait for a usable fix; don't lock a Wi‑Fi mis-pin at session start.
  if (!lastGoodFix) {
    const normalized = normalizeAccuracy(coords.accuracy);
    if (normalized == null) return false;
    if (normalized > MIN_BOOTSTRAP_ACCURACY_M) return false;
    rememberFix(coords, timestamp, normalized);
    return true;
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

  if (
    lastGoodFix &&
    accuracy <= PRECISE_FIX_ACCURACY_M + 20 &&
    shouldPreferIncomingLocationFix(
      { lat: lastGoodFix.lat, lon: lastGoodFix.lon, accuracy: lastGoodFix.accuracy },
      { lat: coords.latitude, lon: coords.longitude, accuracy },
    )
  ) {
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
