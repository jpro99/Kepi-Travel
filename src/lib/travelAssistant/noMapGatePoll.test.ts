import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const liveMapSrc = readFileSync(
  fileURLToPath(new URL("../../components/travelAssistant/LiveMapPage.tsx", import.meta.url)),
  "utf8",
);
const airportMapSrc = readFileSync(
  fileURLToPath(new URL("../../components/travelAssistant/AirportNavigatorMap.tsx", import.meta.url)),
  "utf8",
);

test("LiveMapPage does not poll flight/gate status on the map (CEO supersede)", () => {
  assert.doesNotMatch(liveMapSrc, /useAtAirportFlightStatusPoll/);
  assert.match(liveMapSrc, /storedGateCode/);
  assert.match(liveMapSrc, /flightDepartureGate/);
});

test("Live Map keeps a single steady geolocation watch — no proximity-bucket restart loop", () => {
  assert.doesNotMatch(liveMapSrc, /navProximity\.status\]/);
  assert.match(liveMapSrc, /maximumAge:\s*15_000/);
});

test("AirportNavigatorMap does not poll flight/gate status on the map", () => {
  assert.doesNotMatch(airportMapSrc, /useAtAirportFlightStatusPoll/);
  assert.doesNotMatch(airportMapSrc, /flight-lookup/);
  assert.doesNotMatch(airportMapSrc, /setInterval\([^)]*poll/i);
});

test("Live Map does not use 2s gate/status refetch intervals", () => {
  for (const src of [liveMapSrc, airportMapSrc]) {
    assert.doesNotMatch(src, /setInterval\([^,]+,\s*2_000\)/);
    assert.doesNotMatch(src, /setInterval\([^,]+,\s*2000\)/);
  }
});
