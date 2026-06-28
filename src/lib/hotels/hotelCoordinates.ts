import type { HotelSearchResult } from "@/lib/hotels/types";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Stable spread around city center until live lat/lng exists on the quote. */
export function coordinateForHotel(
  hotelId: string,
  index: number,
  total: number,
  centerLat: number,
  centerLng: number,
): { lat: number; lng: number } {
  const seed = hashSeed(hotelId);
  const angle = ((seed % 360) / 360) * Math.PI * 2 + (index / Math.max(total, 1)) * 0.65;
  const ring = 0.008 + (seed % 11) * 0.004 + (index % 9) * 0.003;
  return {
    lat: centerLat + Math.sin(angle) * ring,
    lng: centerLng + Math.cos(angle) * ring,
  };
}

const MIN_PIN_SEPARATION_DEG = 0.0025;

function nudgeAwayFromNeighbors(
  lat: number,
  lng: number,
  placed: Array<{ lat: number; lng: number }>,
  index: number,
): { lat: number; lng: number } {
  let nextLat = lat;
  let nextLng = lng;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const crowded = placed.some(
      (point) => Math.hypot(nextLat - point.lat, nextLng - point.lng) < MIN_PIN_SEPARATION_DEG,
    );
    if (!crowded) break;
    const angle = ((index + attempt) / 12) * Math.PI * 2;
    nextLat = lat + Math.sin(angle) * MIN_PIN_SEPARATION_DEG * (attempt + 1);
    nextLng = lng + Math.cos(angle) * MIN_PIN_SEPARATION_DEG * (attempt + 1);
  }
  return { lat: nextLat, lng: nextLng };
}

export function attachHotelCoordinates<T extends HotelSearchResult>(
  hotels: T[],
  centerLat: number,
  centerLng: number,
): Array<T & { lat: number; lng: number }> {
  const placed: Array<{ lat: number; lng: number }> = [];

  return hotels.map((hotel, index) => {
    let lat: number;
    let lng: number;
    if (typeof hotel.lat === "number" && typeof hotel.lng === "number") {
      lat = hotel.lat;
      lng = hotel.lng;
    } else {
      const coords = coordinateForHotel(hotel.id, index, hotels.length, centerLat, centerLng);
      lat = coords.lat;
      lng = coords.lng;
    }

    const nudged = nudgeAwayFromNeighbors(lat, lng, placed, index);
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
