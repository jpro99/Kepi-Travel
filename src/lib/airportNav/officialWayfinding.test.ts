import assert from "node:assert/strict";
import test from "node:test";
import {
  getAirportWayfindingResource,
  hasVerifiedAirportWayfinding,
  listVerifiedAirportWayfindingResources,
  wayfindingHonestyTier,
} from "@/lib/airportNav/officialWayfinding";

test("SEA uses its verified official live indoor map", () => {
  const resource = getAirportWayfindingResource("sea");

  assert.equal(resource?.official, true);
  assert.equal(resource?.kind, "official_live_indoor");
  assert.equal(resource?.supportsCurrentLocation, true);
  assert.equal(resource?.supportsStepByStep, true);
  assert.equal(resource?.availableOffline, false);
  assert.equal(resource?.url, "https://maps.flysea.org/");
  assert.equal(wayfindingHonestyTier(resource), "strong");
  assert.equal(hasVerifiedAirportWayfinding("SEA"), true);
});

test("unverified airports receive an honest universal map fallback", () => {
  const resource = getAirportWayfindingResource("ONT");

  assert.equal(resource?.official, false);
  assert.equal(resource?.kind, "universal_map");
  assert.equal(resource?.supportsStepByStep, false);
  assert.match(resource?.url ?? "", /google\.com\/maps\/search/);
  assert.match(decodeURIComponent(resource?.url ?? ""), /ONT airport terminal map/);
  assert.equal(wayfindingHonestyTier(resource), "weak");
  assert.equal(hasVerifiedAirportWayfinding("ONT"), false);
});

test("official but non-step-by-step maps are official_static, not strong", () => {
  const hnl = getAirportWayfindingResource("HNL");
  assert.equal(hnl?.official, true);
  assert.equal(hnl?.supportsStepByStep, false);
  assert.equal(wayfindingHonestyTier(hnl), "official_static");
});

test("trip airports use verified official resources with honest capabilities", () => {
  const fco = getAirportWayfindingResource("FCO");
  const hnl = getAirportWayfindingResource("HNL");

  assert.equal(fco?.official, true);
  assert.equal(fco?.supportsStepByStep, true);
  assert.equal(wayfindingHonestyTier(fco), "strong");
  assert.equal(hnl?.official, true);
  assert.equal(hnl?.supportsStepByStep, false);
});

test("verified registry never claims third-party maps are offline downloads", () => {
  for (const resource of listVerifiedAirportWayfindingResources()) {
    assert.equal(resource.availableOffline, false, `${resource.iata} must remain online-only`);
  }
});
