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
  return /monopoli|polignano|positano|amalfi|ravello|manarola|monterosso|cefalù|cefalu|ortisei|sperlonga|tropea|matera|alberobello|locorotondo|ostuni|gallipoli|otranto|leuca/.test(
    lower,
  );
}

export function inCityRadiusKm(searchCity: string): number {
  return isSmallDestination(searchCity) ? 5.5 : 10;
}

/** Max distance from search center to trust provider lat/lng for map placement. */
export function maxTrustedCoordKm(searchCity: string): number {
  return isSmallDestination(searchCity) ? 2.5 : 12;
}

/** Providers sometimes swap lat/lng — common cause of pins in the ocean. */
export function fixPossibleLatLngSwap(
  lat: number,
  lng: number,
  center: SearchCenter,
): { lat: number; lng: number; swapped: boolean } {
  const normalKm = haversineKm(center.lat, center.lng, lat, lng);
  const swappedKm = haversineKm(center.lat, center.lng, lng, lat);

  if (swappedKm + 0.3 < normalKm && swappedKm < maxTrustedCoordKm("default") && normalKm > 1.5) {
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
  const { lat: fixedLat, lng: fixedLng } = fixPossibleLatLngSwap(lat, lng, center);
  return haversineKm(center.lat, center.lng, fixedLat, fixedLng) <= maxTrustedCoordKm(searchCity);
}
