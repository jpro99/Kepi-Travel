import test from "node:test";
import assert from "node:assert/strict";
import { estimateHotelPointsOptions, resolvePointsCashBasis } from "@/lib/hotels/hotelPointsEstimate";
import type { HotelSearchResult } from "@/lib/hotels/types";

function stubHotel(overrides: Partial<HotelSearchResult> = {}): HotelSearchResult {
  return {
    id: "h-1",
    name: "Andaz Munich Schwabinger Tor",
    chainName: "Hyatt",
    stars: 5,
    pricePerNight: 674,
    totalPrice: 3370,
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
    ...overrides,
  };
}

test("H12 — points catalog estimate without wallet balance", () => {
  const options = estimateHotelPointsOptions(3370, "Hyatt", "Andaz Munich", []);
  assert.ok(options.length > 0);
  assert.equal(options[0]?.programId, "hyatt");
  assert.ok((options[0]?.milesNeeded ?? 0) > 0);
  assert.match(options[0]?.reason ?? "", /chain site/i);
});

test("H12 — IHG hotels get catalog points estimate", () => {
  const options = estimateHotelPointsOptions(
    895,
    "IHG",
    "Holiday Inn Munich",
    [],
  );
  assert.ok(options.length > 0);
  assert.equal(options[0]?.programId, "ihg");
});

test("H12 — browse-only hotels use star-based cash basis for points math", () => {
  const basis = resolvePointsCashBasis(
    stubHotel({ browseOnly: true, pricePerNight: 0, totalPrice: 0, stars: 4, nights: 5 }),
  );
  assert.equal(basis, 1200);
  const options = estimateHotelPointsOptions(basis, "Hyatt", "Andaz Munich", []);
  assert.ok(options.length > 0);
});
