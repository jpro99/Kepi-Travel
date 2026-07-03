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

test("resolveCashBookUrl prefers airline site when carrier is known", () => {
  const result = resolveCashBookUrl({
    origin: "SEA",
    destination: "HND",
    departureDate: "2026-04-01",
    airline: "Alaska Airlines",
    airlineIata: "AS",
    offerId: "off_abc123",
    quotedPriceUsd: 842,
    flightNumber: "AS65",
  });
  assert.match(result.url, /alaskaair\.com/);
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
    airlineIata: "AS",
  });
  assert.match(result.url, /alaskaair\.com/);
  assert.match(result.label, /Alaska/);
});

test("buildGoogleHotelsUrl encodes property and dates", () => {
  const url = buildGoogleHotelsUrl({
    propertyName: "Hyatt Regency Rome",
    destination: "Rome, Italy",
    checkInDate: "2026-09-01",
    checkOutDate: "2026-09-05",
  });
  assert.match(url, /google\.com\/travel\/hotels\//);
  assert.match(decodeURIComponent(url), /Rome.*Italy/i);
  assert.match(url, /Hyatt/);
  assert.match(url, /2026-09-01/);
  assert.match(url, /through/);
  assert.match(url, /utm_source=kepitravel/);
});

test("buildGoogleHotelsUrl appends partner param when configured", () => {
  const previous = process.env.KEPI_GOOGLE_HOTELS_PARTNER;
  process.env.KEPI_GOOGLE_HOTELS_PARTNER = "kepi-demo";
  try {
    const url = buildGoogleHotelsUrl({
      propertyName: "hotels",
      destination: "Monopoli, Italy",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-05",
    });
    assert.match(url, /partner=kepi-demo/);
  } finally {
    if (previous === undefined) delete process.env.KEPI_GOOGLE_HOTELS_PARTNER;
    else process.env.KEPI_GOOGLE_HOTELS_PARTNER = previous;
  }
});

test("buildGoogleHotelsUrl anchors Italian B&B away from user GPS", () => {
  const url = buildGoogleHotelsUrl({
    propertyName: "Le Caravelle Bed and Breakfast",
    destination: "Monopoli, Italy",
    address: "Via Cavaliere 14, 70044 Polignano a Mare",
    checkInDate: "2026-09-05",
    checkOutDate: "2026-09-08",
  });
  const decoded = decodeURIComponent(url.replace(/\+/g, " "));
  assert.match(decoded, /Monopoli.*Italy/i);
  assert.match(decoded, /Le Caravelle/i);
  assert.doesNotMatch(decoded, /\bto 2026-/);
});

test("resolveHotelBookUrl prefers chain site when chain is known", () => {
  const result = resolveHotelBookUrl({
    propertyName: "Hotel Danieli Venice",
    chainName: "Marriott",
    location: "Venice",
    checkInDate: "2026-06-10",
    checkOutDate: "2026-06-14",
    quotedPriceUsd: 1240,
    quoteId: "stay_live_abc",
  });
  assert.match(result.url, /marriott\.com/);
  assert.match(result.label, /Danieli|Marriott/);
});

test("resolveHotelBookUrl uses chain site with dates when chain is known", () => {
  const result = resolveHotelBookUrl({
    propertyName: "Grand Hyatt",
    chainName: "Hyatt",
    destination: "Rome, Italy",
    checkInDate: "2026-06-10",
    checkOutDate: "2026-06-14",
    guests: 2,
    rooms: 1,
  });
  assert.match(result.url, /hyatt\.com/);
  assert.match(result.label, /Hyatt/);
});
