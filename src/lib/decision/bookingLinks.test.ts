import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleFlightsUrl, resolveCashBookUrl } from "./bookingLinks";

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
