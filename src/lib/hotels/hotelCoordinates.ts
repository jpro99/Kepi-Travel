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
  const angle = ((seed % 360) / 360) * Math.PI * 2 + (index / Math.max(total, 1)) * 0.4;
  const ring = 0.006 + (seed % 9) * 0.003 + (index % 7) * 0.002;
  return {
    lat: centerLat + Math.sin(angle) * ring,
    lng: centerLng + Math.cos(angle) * ring,
  };
}

export function attachHotelCoordinates<T extends HotelSearchResult>(
  hotels: T[],
  centerLat: number,
  centerLng: number,
): Array<T & { lat: number; lng: number }> {
  return hotels.map((hotel, index) => {
    if (typeof hotel.lat === "number" && typeof hotel.lng === "number") {
      return hotel as T & { lat: number; lng: number };
    }
    const coords = coordinateForHotel(hotel.id, index, hotels.length, centerLat, centerLng);
    return { ...hotel, ...coords };
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
