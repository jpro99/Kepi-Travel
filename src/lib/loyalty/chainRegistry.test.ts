import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAirlineBookUrl,
  buildHotelChainBookUrl,
  matchAirlineChain,
  matchHotelChain,
  resolveHotelChainBookUrl,
} from "@/lib/loyalty/chainRegistry";

test("matchHotelChain detects Hyatt sub-brands", () => {
  assert.equal(matchHotelChain("Hyatt", "Andaz Rome"), "hyatt");
  assert.equal(matchHotelChain(undefined, "Marriott Rome"), "marriott");
  assert.equal(matchHotelChain(undefined, "Independent B&B"), null);
});

test("buildHotelChainBookUrl includes dates and property", () => {
  const url = buildHotelChainBookUrl("hyatt", {
    propertyName: "Grand Hyatt Rome",
    city: "Rome, Italy",
    checkIn: "2026-09-01",
    checkOut: "2026-09-05",
    guests: 2,
    rooms: 1,
    usePoints: true,
  });
  assert.match(url, /hyatt\.com/);
  assert.match(url, /2026-09-01/);
  assert.match(url, /2026-09-05/);
  assert.match(url, /rateFilter=woh|woh/i);
});

test("resolveHotelChainBookUrl returns chain booking link", () => {
  const result = resolveHotelChainBookUrl("Marriott", "Westin Rome", {
    propertyName: "Westin Rome",
    city: "Rome, Italy",
    checkIn: "2026-09-01",
    checkOut: "2026-09-05",
  });
  assert.ok(result);
  assert.match(result!.url, /marriott\.com/);
});

test("buildAirlineBookUrl prefills route and date", () => {
  const url = buildAirlineBookUrl("alaska", {
    origin: "SEA",
    destination: "LAX",
    departureDate: "2026-03-15",
    usePoints: true,
  });
  assert.match(url, /alaskaair\.com/);
  assert.match(url, /O=SEA/);
  assert.match(url, /D=LAX/);
  assert.match(url, /AWARD=true/);
});

test("matchAirlineChain matches IATA and name", () => {
  assert.equal(matchAirlineChain(undefined, "AS"), "alaska");
  assert.equal(matchAirlineChain("Delta Air Lines"), "delta");
});
