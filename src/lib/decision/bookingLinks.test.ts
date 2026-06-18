import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleFlightsUrl, buildGoogleHotelsUrl, resolveCashBookUrl, resolveHotelBookUrl } from "./bookingLinks";

test("buildGoogleFlightsUrl encodes origin destination and date", () => {
  const url = buildGoogleFlightsUrl({
    origin: "lax",
    destination: "nrt",
    departureDate: "2026-03-15",
  });
  assert.match(url, /google\.com\/travel\/flights/);
  assert.match(url, /LAX/);
  assert.match(url, /NRT/);
  assert.match(url, /2026-03-15/);
});

test("resolveCashBookUrl uses Google Flights when Duffel offerId is present", () => {
  const result = resolveCashBookUrl({
    origin: "SEA",
    destination: "HND",
    departureDate: "2026-04-01",
    airline: "Alaska Airlines",
    offerId: "off_abc123",
    quotedPriceUsd: 842,
    flightNumber: "AS65",
  });
  assert.match(result.url, /google\.com\/travel\/flights/);
  assert.match(result.label, /Alaska/);
  assert.match(result.label, /842/);
  assert.match(result.label, /AS65/);
});

test("resolveCashBookUrl falls back to airline home without offerId", () => {
  const result = resolveCashBookUrl({
    origin: "SEA",
    destination: "HND",
    departureDate: "2026-04-01",
    airline: "Alaska Airlines",
  });
  assert.equal(result.url, "https://www.alaskaair.com");
  assert.match(result.label, /Alaska/);
});

test("buildGoogleHotelsUrl encodes property and dates", () => {
  const url = buildGoogleHotelsUrl({
    propertyName: "Hyatt Regency Rome",
    location: "Rome",
    checkInDate: "2026-09-01",
    checkOutDate: "2026-09-05",
  });
  assert.match(url, /google\.com\/travel\/hotels/);
  assert.match(url, /Hyatt/);
  assert.match(url, /2026-09-01/);
});

test("resolveHotelBookUrl uses Google Hotels when live quote is present", () => {
  const result = resolveHotelBookUrl({
    propertyName: "Hotel Danieli Venice",
    chainName: "Marriott",
    location: "Venice",
    checkInDate: "2026-06-10",
    checkOutDate: "2026-06-14",
    quotedPriceUsd: 1240,
    quoteId: "stay_live_abc",
  });
  assert.match(result.url, /google\.com\/travel\/hotels/);
  assert.match(result.label, /Danieli/);
  assert.match(result.label, /1,240/);
});

test("resolveHotelBookUrl falls back to chain home without live quote", () => {
  const result = resolveHotelBookUrl({
    propertyName: "Grand Hyatt",
    chainName: "Hyatt",
    checkInDate: "2026-06-10",
    checkOutDate: "2026-06-14",
  });
  assert.equal(result.url, "https://www.hyatt.com");
  assert.match(result.label, /Hyatt/);
});
