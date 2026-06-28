import type { TripTransportSegment } from "@/lib/travelAssistant/tripTransportRoute";

export interface RouteMapPoint {
  code: string;
  label: string;
  lat: number;
  lon: number;
  visitCount: number;
}

const ROUTE_SOURCE = "trip-route-segments";
const AIRPORT_SOURCE = "trip-route-airports";

export { ROUTE_SOURCE, AIRPORT_SOURCE };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle arc between two airports for flight path display. */
export function greatCircleLine(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  steps = 48,
): [number, number][] {
  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lon2);

  const Δλ = λ2 - λ1;
  const sinHalfΔσ =
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const σ = 2 * Math.atan2(Math.sqrt(sinHalfΔσ), Math.sqrt(Math.max(0, 1 - sinHalfΔσ)));
  if (σ === 0) return [[lon1, lat1], [lon2, lat2]];

  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * σ) / Math.sin(σ);
    const B = Math.sin(f * σ) / Math.sin(σ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return coords;
}

export function collectRouteMapPoints(segments: TripTransportSegment[]): RouteMapPoint[] {
  const byCode = new Map<string, RouteMapPoint>();

  const touch = (code: string, label: string, lat?: number, lon?: number) => {
    if (lat == null || lon == null || !code || code === "???") return;
    const existing = byCode.get(code);
    if (existing) {
      existing.visitCount += 1;
      return;
    }
    byCode.set(code, { code, label, lat, lon, visitCount: 1 });
  };

  for (const segment of segments) {
    touch(segment.fromCode, segment.fromLabel, segment.lat, segment.lon);
    touch(segment.toCode, segment.toLabel, segment.toLat, segment.toLon);
  }

  return Array.from(byCode.values());
}

export function buildRouteSegmentGeoJson(segments: TripTransportSegment[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const segment of segments) {
    if (segment.lat == null || segment.lon == null || segment.toLat == null || segment.toLon == null) {
      continue;
    }

    const dashed = !segment.booked || segment.status === "conflict";
    let color = "#22c55e";
    if (segment.status === "conflict") color = "#ef4444";
    else if (!segment.booked) color = "#64748b";
    else if (segment.kind === "train") color = "#14b8a6";
    else if (segment.kind === "ride") color = "#f59e0b";

    features.push({
      type: "Feature",
      id: segment.id,
      properties: {
        segmentId: segment.id,
        reservationId: segment.reservationId ?? "",
        color,
        dashed,
        booked: segment.booked,
        status: segment.status,
        headline: segment.headline,
        fromCode: segment.fromCode,
        toCode: segment.toCode,
      },
      geometry: {
        type: "LineString",
        coordinates: greatCircleLine(segment.lon, segment.lat, segment.toLon, segment.toLat),
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export function buildAirportGeoJson(points: RouteMapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      id: point.code,
      properties: {
        code: point.code,
        label: point.label,
        visitCount: point.visitCount,
      },
      geometry: {
        type: "Point",
        coordinates: [point.lon, point.lat],
      },
    })),
  };
}

export function segmentBounds(
  segment: TripTransportSegment,
): { west: number; south: number; east: number; north: number } | null {
  if (segment.lat == null || segment.lon == null || segment.toLat == null || segment.toLon == null) {
    return null;
  }
  return {
    west: Math.min(segment.lon, segment.toLon),
    east: Math.max(segment.lon, segment.toLon),
    south: Math.min(segment.lat, segment.toLat),
    north: Math.max(segment.lat, segment.toLat),
  };
}
