import { test } from "node:test";
import assert from "node:assert/strict";
import { applyClickToPlace } from "./clickToPlace";
import type { AirportLayout } from "./types";

const BASE: AirportLayout = {
  iata: "TST",
  name: "Test",
  layoutVersion: "test",
  updatedAt: "2026-07-15",
  center: [0, 0],
  zones: [{ id: "z1", name: "Z", ring: [[0, 0], [0, 1], [1, 1], [0, 0]], airside: false, heightM: 10 }],
  nodes: [{ id: "hub", pos: [0, 0], kind: "junction", airside: true }],
  edges: [],
  pois: [],
  gateNodeResolver: [],
};

test("click-to-place adds a surveyed gate at the exact clicked coordinate", () => {
  const next = applyClickToPlace(BASE, {
    lng: -118.4,
    lat: 33.94,
    category: "gate",
    name: "Gate 42",
  });
  assert.equal(next.pois.length, 1);
  assert.equal(next.pois[0].precision, "surveyed");
  assert.equal(next.pois[0].category, "gate");
  const node = next.nodes.find((n) => n.id === next.pois[0].nodeId);
  assert.deepEqual(node?.pos, [-118.4, 33.94]);
});

test("click-to-place never marks security as surveyed (M32)", () => {
  const next = applyClickToPlace(BASE, {
    lng: -118.4,
    lat: 33.94,
    category: "security",
    name: "Security",
  });
  assert.equal(next.pois[0].precision, "schematic");
  assert.equal(next.nodes.find((n) => n.id === next.pois[0].nodeId)?.airside, false);
});

test("click-to-place carries airline IATA for Duffel logo lookup", () => {
  const next = applyClickToPlace(BASE, {
    lng: -122.3,
    lat: 47.44,
    category: "checkin",
    name: "United check-in",
    airline: "United",
    airlineIataCode: "ua",
    doorLabel: "Door 7",
  });
  assert.equal(next.pois[0].airlineIataCode, "UA");
  assert.equal(next.pois[0].doorLabel, "Door 7");
  assert.equal(next.pois[0].precision, "surveyed");
});
