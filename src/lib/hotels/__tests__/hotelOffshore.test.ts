import test from "node:test";
import assert from "node:assert/strict";
import { attachHotelCoordinates, resolveHotelMapPosition } from "@/lib/hotels/hotelCoordinates";
import { areCoordsTrusted, isLikelyOffshorePin } from "@/lib/hotels/hotelGeo";
import type { HotelSearchResult } from "@/lib/hotels/types";

const POLIGNANO = { lat: 40.995, lng: 17.217 };
const SEARCH_CITY = "Polignano a Mare, Italy";

function stubHotel(overrides: Partial<HotelSearchResult> = {}): HotelSearchResult {
  return {
    id: "test",
    name: "Hotel Polignano",
    stars: 4,
    pricePerNight: 138,
    totalPrice: 276,
    currency: "USD",
    nights: 2,
    address: "Lungomare, Polignano a Mare",
    city: "Polignano a Mare",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    ...overrides,
  };
}

test("M2 — Polignano provider coords in the Adriatic are rejected as offshore", () => {
  const offshoreLat = 40.995;
  const offshoreLng = 17.2245;

  assert.equal(isLikelyOffshorePin(offshoreLat, offshoreLng, POLIGNANO, SEARCH_CITY), true);
  assert.equal(areCoordsTrusted(offshoreLat, offshoreLng, POLIGNANO, SEARCH_CITY), false);

  const resolved = resolveHotelMapPosition({
    hotel: stubHotel({ lat: offshoreLat, lng: offshoreLng }),
    index: 0,
    total: 12,
    center: POLIGNANO,
    searchCity: SEARCH_CITY,
  });

  assert.equal(resolved.usedProviderCoords, false);
  assert.ok(Math.abs(resolved.lat - POLIGNANO.lat) < 0.008);
  assert.ok(Math.abs(resolved.lng - POLIGNANO.lng) < 0.008);
  assert.ok(resolved.lng <= POLIGNANO.lng + 0.002, "synthetic pin must stay landward of center");
});

test("M2 — attachHotelCoordinates keeps Polignano pins clustered on land", () => {
  const hotels = Array.from({ length: 20 }, (_, index) =>
    stubHotel({
      id: `hotel-${index}`,
      lat: 40.995,
      lng: 17.223 + index * 0.0003,
    }),
  );

  const placed = attachHotelCoordinates(hotels, POLIGNANO.lat, POLIGNANO.lng, SEARCH_CITY);
  for (const row of placed) {
    assert.ok(
      row.lng <= POLIGNANO.lng + 0.003,
      `${row.id} lng ${row.lng} drifted seaward`,
    );
    assert.ok(Math.abs(row.lat - POLIGNANO.lat) < 0.01);
  }
});
