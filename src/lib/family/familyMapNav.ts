export interface LatLon {
  lat: number;
  lon: number;
}

const WALK_SPEED_M_PER_MIN = 5000 / 60; // ~5 km/h

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const r = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function walkingEta(a: LatLon, b: LatLon): { distanceM: number; minutes: number; label: string } {
  const distanceM = Math.round(haversineMeters(a, b));
  const minutes = Math.max(1, Math.round(distanceM / WALK_SPEED_M_PER_MIN));
  const label =
    distanceM < 1000
      ? `${minutes} min walk · ${distanceM} m`
      : `${minutes} min walk · ${(distanceM / 1000).toFixed(1)} km`;
  return { distanceM, minutes, label };
}

export function bearingDegrees(from: LatLon, to: LatLon): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function headingDelta(currentHeading: number, targetBearing: number): number {
  let delta = targetBearing - currentHeading;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function formatHeadingHint(delta: number): string {
  const abs = Math.abs(delta);
  if (abs <= 20) return "Head straight";
  if (abs >= 160) return "Turn around";
  return delta > 0 ? `Turn right ${Math.round(abs)}°` : `Turn left ${Math.round(abs)}°`;
}
