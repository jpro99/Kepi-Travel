import test from "node:test";
import assert from "node:assert/strict";
import {
  isWithinRenderDistance,
  MAX_HOTEL_RENDER_DISTANCE_KM,
  haversineKm,
} from "@/lib/hotels/hotelGeo";
import { attachHotelCoordinates } from "@/lib/hotels/hotelCoordinates";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

/** Munich city center — LAW 1 regression anchor. */
const MUNICH = { lat: 48.1351, lng: 11.582 };

function stubHotel(overrides: Partial<RankedHotelSearchResult>): RankedHotelSearchResult {
  return {
    id: "h1",
    name: "Test Hotel",
    stars: 4,
    rating: 4.2,
    pricePerNight: 180,
    totalPrice: 540,
    currency: "USD",
    nights: 3,
    address: "Munich",
    city: "Munich",
    checkIn: "2026-06-01",
    checkOut: "2026-06-04",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    rank: 1,
    fitScore: 80,
    tier: "solid",
    whyLine: "Good fit",
    badges: [],
    qualityScore: 80,
    valueScore: 70,
    inSearchCity: true,
    ...overrides,
  };
}

test("LAW 1 — hotels beyond 50km from Munich center are not within render distance", () => {
  const oceanLat = 48.1351;
  const oceanLng = 12.5;
  const km = haversineKm(MUNICH.lat, MUNICH.lng, oceanLat, oceanLng);
  assert.ok(km > MAX_HOTEL_RENDER_DISTANCE_KM || !isWithinRenderDistance(oceanLat, oceanLng, MUNICH));

  const adriatic = { lat: 41.0, lng: 17.0 };
  assert.equal(isWithinRenderDistance(adriatic.lat, adriatic.lng, MUNICH), false);
});

test("LAW 1 — attachHotelCoordinates never places Munich search pins beyond 50km", () => {
  const hotels = [
    stubHotel({ id: "near", lat: 48.14, lng: 11.59 }),
    stubHotel({ id: "bad-ocean", lat: 48.13, lng: 12.8 }),
    stubHotel({ id: "no-coords", lat: undefined, lng: undefined }),
  ];

  const placed = attachHotelCoordinates(hotels, MUNICH.lat, MUNICH.lng, "Munich, Germany");
  for (const row of placed) {
    const km = haversineKm(MUNICH.lat, MUNICH.lng, row.lat, row.lng);
    assert.ok(
      km <= MAX_HOTEL_RENDER_DISTANCE_KM,
      `${row.id} at ${km.toFixed(1)}km exceeds ${MAX_HOTEL_RENDER_DISTANCE_KM}km cap`,
    );
  }
});
