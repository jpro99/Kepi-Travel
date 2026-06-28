import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHotelNightlyPrice,
  formatHotelNightlyPriceCaption,
} from "@/lib/hotels/hotelCardDisplay";
import { hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function stubHotel(overrides: Partial<RankedHotelSearchResult> = {}): RankedHotelSearchResult {
  return {
    id: "card-1",
    name: "Holiday Inn Munich",
    stars: 4,
    rating: 4.2,
    pricePerNight: 179,
    totalPrice: 895,
    currency: "USD",
    nights: 5,
    address: "Munich",
    city: "Munich",
    checkIn: "2026-09-20",
    checkOut: "2026-09-25",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    bookOfferId: "offer-123",
    bookProvider: "liteapi",
    rateRoomName: "Standard King",
    rank: 1,
    fitScore: 80,
    tier: "solid",
    whyLine: "",
    badges: [],
    qualityScore: 80,
    valueScore: 70,
    ...overrides,
  };
}

test("H10 — Kepi bookable rates show dollar amount without From prefix", () => {
  const hotel = stubHotel();
  assert.equal(hasKepiBookableLiveRate(hotel), true);
  assert.equal(formatHotelNightlyPrice(hotel), "$179");
  assert.match(formatHotelNightlyPriceCaption(hotel), /Standard King/);
});

test("H10 — indicative rates without offer id show From prefix", () => {
  const hotel = stubHotel({ bookOfferId: undefined, bookProvider: undefined });
  assert.equal(formatHotelNightlyPrice(hotel), "From $179");
  assert.match(formatHotelNightlyPriceCaption(hotel), /verify before booking/);
});

test("H10 — estimated and catalog hotels never show fake dollar prices", () => {
  const hotel = stubHotel({ browseOnly: true, pricePerNight: 0, bookOfferId: undefined });
  assert.equal(formatHotelNightlyPrice(hotel), "Check site");
});
