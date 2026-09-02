import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceKm,
  getAirportByIata,
  getAirportProximity,
  isNearAirportIata,
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

test("distanceKm is roughly zero for identical points", () => {
  assert.ok(distanceKm(SEA.lat, SEA.lon, SEA.lat, SEA.lon) < 0.01);
});

test("isNearAirportIata uses slack for indoor GPS drift at FCO", () => {
  const fco = getAirportByIata("FCO")!;
  assert.equal(isNearAirportIata(fco.lat, fco.lon, "FCO"), true);
  // ~1 km north of centroid — still inside 4.5km * 1.35 slack
  assert.equal(isNearAirportIata(fco.lat + 0.009, fco.lon, "FCO"), true);
  assert.equal(isNearAirportIata(DOWNTOWN_SEA.lat, DOWNTOWN_SEA.lon, "FCO"), false);
});
