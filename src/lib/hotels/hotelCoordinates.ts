import {
  areCoordsTrusted,
  fixPossibleLatLngSwap,
  haversineKm,
  isLikelyOffshorePin,
  isSmallDestination,
  isWithinRenderDistance,
  maxTrustedCoordKm,
  type SearchCenter,
} from "@/lib/hotels/hotelGeo";
import type { HotelSearchResult } from "@/lib/hotels/types";

export type { SearchCenter };

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function isFiniteCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Stable spread around city center when provider coordinates are missing or invalid. */
export function coordinateForHotel(
  hotelId: string,
  index: number,
  total: number,
  centerLat: number,
  centerLng: number,
  searchCity?: string,
): { lat: number; lng: number } {
  const seed = hashSeed(hotelId);
  const angle = ((seed % 360) / 360) * Math.PI * 2 + (index / Math.max(total, 1)) * 0.65;
  const tight = searchCity ? isSmallDestination(searchCity) : false;
  const ring = tight
    ? 0.00035 + (seed % 7) * 0.00028 + (index % 5) * 0.0002
    : 0.008 + (seed % 11) * 0.004 + (index % 9) * 0.003;
  return {
    lat: centerLat + Math.sin(angle) * ring,
    lng: centerLng + Math.cos(angle) * ring,
  };
}

const MIN_PIN_SEPARATION_DEG = 0.0018;
const MAX_NUDGE_DEG = 0.005;

function clampToMaxRadius(
  lat: number,
  lng: number,
  center: SearchCenter,
  searchCity: string,
): { lat: number; lng: number } {
  const maxKm = maxTrustedCoordKm(searchCity);
  const km = haversineKm(center.lat, center.lng, lat, lng);
  if (km <= maxKm) return { lat, lng };

  const scale = maxKm / Math.max(km, 0.001);
  return {
    lat: center.lat + (lat - center.lat) * scale,
    lng: center.lng + (lng - center.lng) * scale,
  };
}

function nudgeAwayFromNeighbors(
  lat: number,
  lng: number,
  placed: Array<{ lat: number; lng: number }>,
  index: number,
  center: SearchCenter,
  searchCity: string,
): { lat: number; lng: number } {
  let nextLat = lat;
  let nextLng = lng;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const crowded = placed.some(
      (point) => Math.hypot(nextLat - point.lat, nextLng - point.lng) < MIN_PIN_SEPARATION_DEG,
    );
    if (!crowded) break;
    const angle = ((index + attempt) / 8) * Math.PI * 2;
    const offset = Math.min(MIN_PIN_SEPARATION_DEG * (attempt + 1), MAX_NUDGE_DEG);
    nextLat = lat + Math.sin(angle) * offset;
    nextLng = lng + Math.cos(angle) * offset;
  }
  if (isLikelyOffshorePin(nextLat, nextLng, center, searchCity)) {
    nextLat = center.lat + (nextLat - center.lat) * 0.35;
    nextLng = center.lng + (nextLng - center.lng) * 0.35;
  }
  return clampToMaxRadius(nextLat, nextLng, center, searchCity);
}

export function resolveHotelMapPosition(input: {
  hotel: HotelSearchResult;
  index: number;
  total: number;
  center: SearchCenter;
  searchCity: string;
}): { lat: number; lng: number; usedProviderCoords: boolean } {
  const { hotel, index, total, center, searchCity } = input;

  if (isFiniteCoord(hotel.lat, hotel.lng)) {
    const fixed = fixPossibleLatLngSwap(hotel.lat, hotel.lng, center, searchCity);
    if (areCoordsTrusted(fixed.lat, fixed.lng, center, searchCity)) {
      return {
        lat: fixed.lat,
        lng: fixed.lng,
        usedProviderCoords: true,
      };
    }
  }

  const synthetic = coordinateForHotel(hotel.id, index, total, center.lat, center.lng, searchCity);
  return { lat: synthetic.lat, lng: synthetic.lng, usedProviderCoords: false };
}

export function filterHotelsWithinRenderDistance<T extends HotelSearchResult>(
  hotels: T[],
  center: SearchCenter,
  searchCity = "",
): T[] {
  return hotels.filter((hotel) => {
    if (!isFiniteCoord(hotel.lat, hotel.lng)) return true;
    const fixed = fixPossibleLatLngSwap(hotel.lat, hotel.lng, center, searchCity);
    return isWithinRenderDistance(fixed.lat, fixed.lng, center);
  });
}

export function attachHotelCoordinates<T extends HotelSearchResult>(
  hotels: T[],
  centerLat: number,
  centerLng: number,
  searchCity = "",
): Array<T & { lat: number; lng: number }> {
  const center = { lat: centerLat, lng: centerLng };
  const placed: Array<{ lat: number; lng: number }> = [];

  return hotels.map((hotel, index) => {
    const resolved = resolveHotelMapPosition({
      hotel,
      index,
      total: hotels.length,
      center,
      searchCity,
    });
    const nudged = nudgeAwayFromNeighbors(
      resolved.lat,
      resolved.lng,
      placed,
      index,
      center,
      searchCity,
    );
    placed.push(nudged);
    return { ...hotel, ...nudged };
  });
}

export function hotelInBounds(
  hotel: { lat?: number; lng?: number },
  bounds: MapBounds | null,
): boolean {
  if (!bounds) return true;
  if (hotel.lat == null || hotel.lng == null) return true;
  return (
    hotel.lat <= bounds.north &&
    hotel.lat >= bounds.south &&
    hotel.lng <= bounds.east &&
    hotel.lng >= bounds.west
  );
}

export { areCoordsTrusted, fixPossibleLatLngSwap, maxTrustedCoordKm };
