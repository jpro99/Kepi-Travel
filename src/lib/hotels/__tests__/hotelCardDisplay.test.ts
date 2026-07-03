import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeHotelPriceLabel,
  formatHotelNightlyPrice,
  formatHotelTotalPrice,
  resolveHotelHeroVisual,
} from "@/lib/hotels/hotelCardDisplay";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function stubHotel(overrides: Partial<RankedHotelSearchResult> = {}): RankedHotelSearchResult {
  return {
    id: "card-1",
    name: "Bayerischer Hof",
    stars: 5,
    rating: 4.8,
    pricePerNight: 285,
    totalPrice: 855,
    currency: "USD",
    nights: 3,
    address: "Munich",
    city: "Munich",
    checkIn: "2026-06-01",
    checkOut: "2026-06-04",
    amenities: ["WiFi", "Breakfast"],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    rank: 1,
    fitScore: 90,
    tier: "kepi_pick",
    whyLine: "Top match",
    badges: [],
    qualityScore: 95,
    valueScore: 80,
    ...overrides,
  };
}

test("LAW 3 — every card resolves to photo or gradient fallback", () => {
  const noPhoto = resolveHotelHeroVisual(stubHotel({ photos: [] }));
  assert.equal(noPhoto.kind, "gradient");
  assert.ok(noPhoto.initials.length >= 1);

  const withPhoto = resolveHotelHeroVisual(
    stubHotel({ photos: ["https://cdn.example.com/hotel.jpg"] }),
  );
  assert.equal(withPhoto.kind, "photo");
  assert.ok(withPhoto.url?.startsWith("https://"));
});

test("LAW 4 — price labels never contain undefined, NaN, or empty strings", () => {
  const cases = [
    stubHotel(),
    stubHotel({ pricePerNight: NaN, totalPrice: NaN, bookOfferId: undefined }),
    stubHotel({ pricePerNight: 0, browseOnly: true, bookOfferId: undefined }),
    stubHotel({ pricePerNight: -1, bookOfferId: undefined }),
    stubHotel({ bookOfferId: undefined, pricePerNight: 220 }),
  ];

  for (const hotel of cases) {
    const nightly = formatHotelNightlyPrice(hotel);
    const total = formatHotelTotalPrice(hotel);
    assert.ok(assertSafeHotelPriceLabel(nightly), `bad nightly: ${nightly}`);
    if (total) assert.ok(assertSafeHotelPriceLabel(total), `bad total: ${total}`);
    assert.notEqual(nightly.trim(), "");
  }
});
