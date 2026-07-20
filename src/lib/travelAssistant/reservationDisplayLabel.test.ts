import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOtaProvider,
  reservationDisplayLabel,
  reservationPropertyName,
  reservationProviderBadge,
} from "./reservationDisplayLabel";

test("hotel property name beats Booking.com provider (I25)", () => {
  assert.equal(
    reservationPropertyName({
      type: "hotel",
      title: "Casa de Elena",
      provider: "Booking.com",
    }),
    "Casa de Elena",
  );
  assert.match(
    reservationDisplayLabel({
      type: "hotel",
      title: "Casa de Elena",
      provider: "Booking.com",
    }),
    /Casa de Elena/,
  );
  assert.doesNotMatch(
    reservationDisplayLabel({
      type: "hotel",
      title: "Casa de Elena",
      provider: "Booking.com",
    }),
    /^🏨 Booking\.com$/,
  );
});

test("OTA-as-title salvages property name from notes before location", () => {
  assert.equal(
    reservationPropertyName({
      type: "hotel",
      title: "Booking.com",
      provider: "Booking.com",
      location: "Polignano a Mare",
      notes: "You're confirmed at Casa de Elena",
    }),
    "Casa de Elena",
  );
  assert.equal(
    reservationPropertyName({
      type: "hotel",
      title: "Booking.com",
      provider: "Booking.com",
      location: "Polignano a Mare",
    }),
    "Polignano a Mare",
  );
  assert.equal(isOtaProvider("Booking.com"), true);
  assert.equal(reservationProviderBadge("Booking.com"), "Booking.com");
  assert.equal(reservationProviderBadge("Casa de Elena"), null);
});
