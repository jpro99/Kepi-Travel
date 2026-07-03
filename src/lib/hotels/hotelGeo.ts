export interface SearchCenter {
  lat: number;
  lng: number;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isSmallDestination(displayName: string): boolean {
  const lower = displayName.toLowerCase();
  return /monopoli|polignano|positano|amalfi|ravello|manarola|monterosso|cefalù|cefalu|ortisei|sperlonga|tropea|matera|alberobello|locorotondo|ostuni|gallipoli|otranto|leuca|lecce/.test(
    lower,
  );
}

/** Adriatic / Tyrrhenian cliff towns — provider coords often drift seaward. */
function isAdriaticEastCoastTown(displayName: string): boolean {
  return /polignano|monopoli|bari|brindisi|lecce|otranto|gallipoli|ostuni|alberobello|locorotondo|matera|leuca/.test(
    displayName.toLowerCase(),
  );
}

function isTyrrhenianSouthCoastTown(displayName: string): boolean {
  return /positano|amalfi|ravello|sperlonga|cefalù|cefalu|manarola|monterosso|tropea|sperlonga/.test(
    displayName.toLowerCase(),
  );
}

/**
 * LAW M2 — reject pins pushed into open water while still inside the trust radius.
 * Common when LiteAPI coords sit just offshore of cliff towns like Polignano a Mare.
 */
export function isLikelyOffshorePin(
  lat: number,
  lng: number,
  center: SearchCenter,
  searchCity: string,
): boolean {
  if (!isSmallDestination(searchCity)) return false;

  const dLat = lat - center.lat;
  const dLng = lng - center.lng;
  const distanceKm = haversineKm(center.lat, center.lng, lat, lng);
  if (distanceKm < 0.06) return false;

  if (isAdriaticEastCoastTown(searchCity)) {
    return dLng > 0.00035 && dLng >= Math.abs(dLat) * 0.25;
  }

  if (isTyrrhenianSouthCoastTown(searchCity)) {
    return dLat < -0.00035 && Math.abs(dLat) >= Math.abs(dLng) * 0.25;
  }

  return false;
}

export function inCityRadiusKm(searchCity: string): number {
  return isSmallDestination(searchCity) ? 5.5 : 10;
}

/** Max distance from search center to trust provider lat/lng for map placement. */
export function maxTrustedCoordKm(searchCity: string): number {
  return isSmallDestination(searchCity) ? 1.6 : 10;
}

/** LAW 1 — hard cap: never render a hotel pin beyond this distance from search center. */
export const MAX_HOTEL_RENDER_DISTANCE_KM = 50;

export function distanceFromCenterKm(lat: number, lng: number, center: SearchCenter): number {
  return haversineKm(center.lat, center.lng, lat, lng);
}

export function isWithinRenderDistance(lat: number, lng: number, center: SearchCenter): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return distanceFromCenterKm(lat, lng, center) <= MAX_HOTEL_RENDER_DISTANCE_KM;
}

/** Providers sometimes swap lat/lng — common cause of pins in the ocean. */
export function fixPossibleLatLngSwap(
  lat: number,
  lng: number,
  center: SearchCenter,
  searchCity = "",
): { lat: number; lng: number; swapped: boolean } {
  const normalKm = haversineKm(center.lat, center.lng, lat, lng);
  const swappedKm = haversineKm(center.lat, center.lng, lng, lat);
  const trustKm = searchCity ? maxTrustedCoordKm(searchCity) : 10;

  if (swappedKm + 0.3 < normalKm && swappedKm < trustKm && normalKm > 1.5) {
    return { lat: lng, lng: lat, swapped: true };
  }

  return { lat, lng, swapped: false };
}

export function areCoordsTrusted(
  lat: number,
  lng: number,
  center: SearchCenter,
  searchCity: string,
): boolean {
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  const { lat: fixedLat, lng: fixedLng } = fixPossibleLatLngSwap(lat, lng, center, searchCity);
  if (haversineKm(center.lat, center.lng, fixedLat, fixedLng) > maxTrustedCoordKm(searchCity)) {
    return false;
  }
  if (isLikelyOffshorePin(fixedLat, fixedLng, center, searchCity)) {
    return false;
  }
  return true;
}
