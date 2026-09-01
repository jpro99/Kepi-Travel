import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMapHelperNearbyChips } from "./mapHelperNearby";
import type { AirportLayout } from "./types";

const layout: AirportLayout = {
  iata: "SEA",
  name: "Test",
  layoutVersion: "1",
  updatedAt: "2026-07-17",
  center: [-122.302, 47.443],
  zones: [],
  nodes: [
    { id: "n-door22", pos: [-122.302, 47.443], kind: "junction", airside: false },
    { id: "n-sbux", pos: [-122.30205, 47.44302], kind: "junction", airside: false },
    { id: "n-gate", pos: [-122.3021, 47.44305], kind: "gate", airside: true },
    { id: "n-far", pos: [-122.31, 47.45], kind: "junction", airside: false },
  ],
  edges: [],
  pois: [
    { id: "poi-ak", nodeId: "n-door22", category: "checkin", name: "Alaska check-in", doorLabel: "Door 22", airline: "Alaska", airlineIataCode: "AS" },
    { id: "poi-sbux", nodeId: "n-sbux", category: "amenity", name: "Starbucks" },
    { id: "poi-gate", nodeId: "n-gate", category: "gate", name: "Gate C11" },
    { id: "poi-far", nodeId: "n-far", category: "amenity", name: "Far Cafe" },
    { id: "poi-sec", nodeId: "n-door22", category: "security", name: "Security — Checkpoint 5" },
  ],
  gateNodeResolver: [],
};

test("nearby chips surface Door confirm and skip security + far POIs", () => {
  const chips = buildMapHelperNearbyChips(layout, [-122.302, 47.443]);
  assert.ok(chips.some((c) => c.kind === "confirm_door" && /22/.test(c.label)));
  assert.ok(!chips.some((c) => /Security/i.test(c.label)));
  assert.ok(!chips.some((c) => /Far Cafe/i.test(c.label)));
});

test("no chips without a position", () => {
  assert.equal(buildMapHelperNearbyChips(layout, null).length, 0);
});

test("nearby chips ask gate + airline confirms for helpers", () => {
  const chips = buildMapHelperNearbyChips(layout, [-122.302, 47.443]);
  assert.ok(chips.some((c) => /Gate C11/i.test(c.label)));
  assert.ok(chips.some((c) => /Alaska here/i.test(c.label)));
});
