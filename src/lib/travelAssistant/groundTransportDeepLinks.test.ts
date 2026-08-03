import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroundTransportDeepLinks,
  buildLyftDeepLink,
  buildRideFromAirportDeepLinks,
  buildRideToAirportDeepLinks,
  buildUberDeepLink,
  isPlausibleCoordinate,
} from "@/lib/travelAssistant/groundTransportDeepLinks";

const pickup = { label: "SEA Airport", lat: 47.4502, lon: -122.3088 };
const dropoff = { label: "Downtown Seattle", lat: 47.6062, lon: -122.3321 };

test("buildUberDeepLink prefills pickup and dropoff coordinates", () => {
  const url = buildUberDeepLink({ pickup, dropoff });
  assert.match(url, /m\.uber\.com\/ul/);
  assert.match(url, /dropoff%5Blatitude%5D=47\.6062/);
  assert.match(url, /pickup%5Blatitude%5D=47\.4502/);
});

test("buildLyftDeepLink prefills coordinates", () => {
  const url = buildLyftDeepLink({ pickup, dropoff });
  assert.match(url, /lyft\.com\/ride/);
  assert.match(url, /pickup%5Blatitude%5D=47\.4502/);
});

test("buildGroundTransportDeepLinks returns both providers", () => {
  const links = buildGroundTransportDeepLinks({ pickup, dropoff });
  assert.ok(links.uberUrl);
  assert.ok(links.lyftUrl);
  assert.equal(links.pickupLabel, pickup.label);
});

test("buildRideToAirportDeepLinks prefills airport dropoff", () => {
  const links = buildRideToAirportDeepLinks("SEA");
  assert.ok(links);
  assert.match(links!.uberUrl, /dropoff%5Blatitude%5D=47\.4502/);
  assert.equal(links!.dropoffLabel, "Seattle");
});

test("buildRideFromAirportDeepLinks prefills airport pickup", () => {
  const links = buildRideFromAirportDeepLinks("SEA");
  assert.ok(links);
  assert.match(links!.uberUrl, /pickup%5Blatitude%5D=47\.4502/);
  assert.equal(links!.pickupLabel, "Seattle");
});

test("buildRideFromAirportDeepLinks includes hotel dropoff when coords exist", () => {
  const links = buildRideFromAirportDeepLinks("SEA", {
    label: "Downtown Seattle",
    lat: 47.6062,
    lon: -122.3321,
  });
  assert.ok(links);
  assert.match(links!.uberUrl, /dropoff%5Blatitude%5D=47\.6062/);
  assert.equal(links!.dropoffLabel, "Downtown Seattle");
});

test("isPlausibleCoordinate rejects invalid coordinates", () => {
  assert.equal(isPlausibleCoordinate(47.6, -122.3), true);
  assert.equal(isPlausibleCoordinate(999, 0), false);
});
