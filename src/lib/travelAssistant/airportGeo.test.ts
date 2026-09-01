import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceKm,
  getAirportByIata,
  getAirportProximity,
  resolveLiveMapAirportIata,
  resolvePhysicalAirportIata,
} from "@/lib/travelAssistant/airportGeo";

const SEA = { lat: 47.4502, lon: -122.3088 };
const DOWNTOWN_SEA = { lat: 47.6062, lon: -122.3321 };

test("getAirportByIata resolves SEA and ZRH (not only ZUR typo)", () => {
  assert.equal(getAirportByIata("SEA")?.name, "Seattle");
  assert.equal(getAirportByIata("ZRH")?.iata, "ZRH");
  assert.equal(getAirportByIata("zur")?.name, "Zurich");
});

test("getAirportProximity is unknown without GPS", () => {
  const result = getAirportProximity(null, null, "SEA");
  assert.equal(result.status, "unknown");
});

test("getAirportProximity marks downtown Seattle as away from SEA", () => {
  const result = getAirportProximity(DOWNTOWN_SEA.lat, DOWNTOWN_SEA.lon, "SEA");
  assert.equal(result.status, "away");
  assert.ok((result.distanceKm ?? 0) > 5);
});

test("getAirportProximity marks SEA campus as at-airport or in-terminal", () => {
  const result = getAirportProximity(SEA.lat, SEA.lon, "SEA");
  assert.ok(result.status === "at-airport" || result.status === "in-terminal");
  assert.equal(result.airport?.iata, "SEA");
});

test("getAirportProximity prefers departure airport when provided", () => {
  const atSea = getAirportProximity(SEA.lat, SEA.lon, "SEA");
  assert.equal(atSea.airport?.iata, "SEA");

  const awayFromFco = getAirportProximity(SEA.lat, SEA.lon, "FCO");
  assert.equal(awayFromFco.status, "away");
});

test("resolvePhysicalAirportIata returns SEA on campus, null downtown", () => {
  assert.equal(resolvePhysicalAirportIata(SEA.lat, SEA.lon), "SEA");
  assert.equal(resolvePhysicalAirportIata(DOWNTOWN_SEA.lat, DOWNTOWN_SEA.lon), null);
  assert.equal(resolvePhysicalAirportIata(null, null), null);
});

test("resolvePhysicalAirportIata ignores a mismatched departure pin", () => {
  assert.equal(resolvePhysicalAirportIata(SEA.lat, SEA.lon), "SEA");
  const biased = getAirportProximity(SEA.lat, SEA.lon, "ONT");
  assert.equal(biased.status, "away");
});

test("distanceKm is roughly zero for identical points", () => {
  assert.ok(distanceKm(SEA.lat, SEA.lon, SEA.lat, SEA.lon) < 0.01);
});

test("resolveLiveMapAirportIata waits for GPS — no stale ONT URL while locating", () => {
  const pending = resolveLiveMapAirportIata({
    userLat: null,
    userLon: null,
    urlIata: "ONT",
    flightIata: "ONT",
  });
  assert.equal(pending.iata, null);
  assert.equal(pending.waitingForGps, true);
  assert.equal(pending.physical, false);
});

test("resolveLiveMapAirportIata picks SEA on campus — ignores ONT URL", () => {
  const atSea = resolveLiveMapAirportIata({
    userLat: SEA.lat,
    userLon: SEA.lon,
    urlIata: "ONT",
    flightIata: "ONT",
  });
  assert.equal(atSea.iata, "SEA");
  assert.equal(atSea.physical, true);
  assert.equal(atSea.waitingForGps, false);
});

test("resolveLiveMapAirportIata allows URL preview only when GPS confirms away", () => {
  const downtown = resolveLiveMapAirportIata({
    userLat: DOWNTOWN_SEA.lat,
    userLon: DOWNTOWN_SEA.lon,
    urlIata: "ONT",
    flightIata: null,
  });
  assert.equal(downtown.iata, "ONT");
  assert.equal(downtown.physical, false);
  assert.equal(downtown.waitingForGps, false);
});
