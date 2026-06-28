import test from "node:test";
import assert from "node:assert/strict";
import { attachHotelCoordinates, resolveHotelMapPosition } from "@/lib/hotels/hotelCoordinates";
import type { HotelSearchResult } from "@/lib/hotels/types";

const MONOPOLI = { lat: 40.9526, lng: 17.2972 };
const SEARCH_CITY = "Monopoli, Italy";

function stubHotel(overrides: Partial<HotelSearchResult>): HotelSearchResult {
  return {
    id: "test",
    name: "Test Hotel",
    stars: 3,
    pricePerNight: 100,
    totalPrice: 300,
    currency: "USD",
    nights: 3,
    address: "",
    city: "Monopoli",
    checkIn: "2026-09-05",
    checkOut: "2026-09-06",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    ...overrides,
  };
}

test("rejects provider coordinates in the Adriatic and places pin near town center", () => {
  const hotel = stubHotel({
    id: "palazzo-indelli",
    name: "Palazzo Indelli",
    address: "Largo Porta Vecchia, Monopoli",
    lat: 40.948,
    lng: 17.38,
    pricePerNight: 241,
  });

  const resolved = resolveHotelMapPosition({
    hotel,
    index: 0,
    total: 1,
    center: MONOPOLI,
    searchCity: SEARCH_CITY,
  });

  assert.equal(resolved.usedProviderCoords, false);
  assert.ok(Math.abs(resolved.lat - MONOPOLI.lat) < 0.02);
  assert.ok(Math.abs(resolved.lng - MONOPOLI.lng) < 0.02);
});

test("attachHotelCoordinates keeps all pins within trusted radius for small towns", () => {
  const hotels = [
    stubHotel({ id: "a", lat: 40.948, lng: 17.38 }),
    stubHotel({ id: "b", lat: 40.951, lng: 17.295 }),
    stubHotel({ id: "c", name: "No coords" }),
  ];

  const placed = attachHotelCoordinates(hotels, MONOPOLI.lat, MONOPOLI.lng, SEARCH_CITY);
  for (const row of placed) {
    const latDelta = Math.abs(row.lat - MONOPOLI.lat);
    const lngDelta = Math.abs(row.lng - MONOPOLI.lng);
    assert.ok(latDelta < 0.03, `${row.id} lat too far`);
    assert.ok(lngDelta < 0.03, `${row.id} lng too far`);
  }
});

test("fixes swapped lat/lng from provider", () => {
  const hotel = stubHotel({
    id: "swapped",
    lat: 17.2972,
    lng: 40.9526,
  });

  const resolved = resolveHotelMapPosition({
    hotel,
    index: 0,
    total: 1,
    center: MONOPOLI,
    searchCity: SEARCH_CITY,
  });

  assert.equal(resolved.usedProviderCoords, true);
  assert.ok(Math.abs(resolved.lat - MONOPOLI.lat) < 0.01);
  assert.ok(Math.abs(resolved.lng - MONOPOLI.lng) < 0.01);
});
