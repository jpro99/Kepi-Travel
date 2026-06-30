/** Convert WGS84 lat/lon to a point on a sphere (Y-up, standard geographic). */
export function latLonToVector3(lat: number, lon: number, radius = 1): { x: number; y: number; z: number } {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/** Sample a great-circle arc with optional altitude bulge for flight-path curves. */
export function buildArcPoints3D(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  steps = 64,
  arcHeight = 0.12,
  radius = 1,
): Array<{ x: number; y: number; z: number }> {
  const start = latLonToVector3(lat1, lon1, radius);
  const end = latLonToVector3(lat2, lon2, radius);
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const z = start.z + (end.z - start.z) * t;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const bulge = 1 + arcHeight * Math.sin(Math.PI * t);
    points.push({ x: (x / len) * radius * bulge, y: (y / len) * radius * bulge, z: (z / len) * radius * bulge });
  }
  return points;
}
