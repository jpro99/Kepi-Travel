import test from "node:test";
import assert from "node:assert/strict";
import { resolveHotelBookingStrategy } from "@/lib/hotels/hotelBookingStrategy";

const base = {
  nights: 3,
  bookOfferId: "offer-1",
  browseOnly: false,
  pricePerNight: 80,
  referencePriceSource: "expedia.com",
};

test("resolveHotelBookingStrategy prefers Google when Kepi is well above reference", () => {
  const strategy = resolveHotelBookingStrategy({
    ...base,
    totalPrice: 295,
    referenceTotalUsd: 234,
  });
  assert.equal(strategy.preferExternal, true);
  assert.equal(strategy.kepiPrimary, false);
  assert.match(strategy.compareLine ?? "", /save ~\$61/i);
});

test("resolveHotelBookingStrategy keeps Kepi primary when within 10%", () => {
  const strategy = resolveHotelBookingStrategy({
    ...base,
    totalPrice: 250,
    referenceTotalUsd: 234,
  });
  assert.equal(strategy.kepiPrimary, true);
  assert.equal(strategy.preferExternal, false);
});

test("resolveHotelBookingStrategy defaults to external when no reference price", () => {
  const strategy = resolveHotelBookingStrategy({
    ...base,
    totalPrice: 295,
  });
  assert.equal(strategy.preferExternal, true);
  assert.match(strategy.compareLine ?? "", /forward confirmation/i);
});
