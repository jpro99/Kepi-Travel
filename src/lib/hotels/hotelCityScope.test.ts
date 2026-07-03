import test from "node:test";
import assert from "node:assert/strict";
import { hotelInSearchCity } from "@/lib/hotels/hotelCityScope";
import type { HotelSearchResult } from "@/lib/hotels/types";

const MONOPOLI_CENTER = { lat: 40.9526, lng: 17.2972 };

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
    city: "Monopoli, Italy",
    checkIn: "2026-06-02",
    checkOut: "2026-06-05",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    ...overrides,
  };
}

test("geo: Monopoli hotel inside radius is in-search-city", () => {
  const hotel = stubHotel({
    name: "Palazzo Indelli",
    address: "Via Vittorio Emanuele, Monopoli",
    lat: 40.953,
    lng: 17.296,
  });
  assert.equal(hotelInSearchCity(hotel, "Monopoli, Italy", MONOPOLI_CENTER), true);
});

test("geo: Polignano hotel is nearby, not Monopoli — even when city field says Monopoli", () => {
  const hotel = stubHotel({
    name: "Hotel Polignano",
    address: "Lungomare, Polignano a Mare",
    city: "Monopoli, Italy",
    lat: 40.995,
    lng: 17.217,
  });
  assert.equal(hotelInSearchCity(hotel, "Monopoli, Italy", MONOPOLI_CENTER), false);
});

test("geo: Bari hotel is nearby", () => {
  const hotel = stubHotel({
    name: "Bari Central Hotel",
    address: "Corso Cavour, Bari",
    lat: 41.1177,
    lng: 16.8512,
  });
  assert.equal(hotelInSearchCity(hotel, "Monopoli, Italy", MONOPOLI_CENTER), false);
});

test("text fallback: address mentions Monopoli when coords missing", () => {
  const hotel = stubHotel({
    name: "Masseria Example",
    address: "Contrada Lamalunga, 70043 Monopoli BA, Italy",
    city: "Monopoli, Italy",
  });
  assert.equal(hotelInSearchCity(hotel, "Monopoli, Italy"), true);
});

test("text fallback: Polignano address without coords is not Monopoli", () => {
  const hotel = stubHotel({
    name: "Hotel Grotta Palazzese",
    address: "Via Narciso, 70044 Polignano a Mare BA, Italy",
    city: "Monopoli, Italy",
  });
  assert.equal(hotelInSearchCity(hotel, "Monopoli, Italy"), false);
});
