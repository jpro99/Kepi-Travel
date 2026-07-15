import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFootwayGraph, nearestFootwayNode } from "./footwayGraph";
import { applyFootwayOverlay } from "./applyFootwayOverlay";
import type { AirportLayout } from "./types";

test("buildFootwayGraph samples pedestrian ways near center", () => {
  const elements = [
    {
      type: "way",
      id: 1,
      tags: { highway: "footway" },
      geometry: [
        { lon: -122.302, lat: 47.443 },
        { lon: -122.3021, lat: 47.4431 },
        { lon: -122.3022, lat: 47.4432 },
      ],
    },
    {
      type: "way",
      id: 2,
      tags: { highway: "primary" },
      geometry: [
        { lon: -122.302, lat: 47.443 },
        { lon: -122.303, lat: 47.444 },
      ],
    },
  ];
  const g = buildFootwayGraph(elements, { center: [-122.302, 47.443], maxDistFromCenterM: 200 });
  assert.equal(g.stats.waysUsed, 1);
  assert.ok(g.nodes.length >= 2);
  assert.ok(g.edges.length >= 1);
  const near = nearestFootwayNode(g.nodes, [-122.30205, 47.44305], 50);
  assert.ok(near);
});

test("applyFootwayOverlay stays schematic when OSM has no pedestrian ways", () => {
  const layout: AirportLayout = {
    iata: "TST",
    name: "Test",
    layoutVersion: "1",
    updatedAt: "2026-07-15",
    center: [0, 0],
    zones: [{ id: "z", name: "z", ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], airside: false, heightM: 10 }],
    nodes: [
      { id: "curb-departures", pos: [0, 0], kind: "junction", airside: false },
      { id: "gate-A", pos: [0.001, 0.001], kind: "gate", airside: true },
    ],
    edges: [
      { id: "e1", from: "curb-departures", to: "gate-A", kind: "security_transition", lengthM: 50, traverseSeconds: 400, bidirectional: false, laneType: "standard" },
    ],
    pois: [
      { id: "poi-checkin-gen", nodeId: "curb-departures", category: "checkin", name: "Check-in" },
      { id: "poi-gate-A", nodeId: "gate-A", category: "gate", name: "A Gates" },
    ],
    gateNodeResolver: [],
  };
  const result = applyFootwayOverlay(layout, []);
  assert.equal(result.layout.routeGrade, "schematic");
  assert.ok(result.warnings.some((w) => /thin/i.test(w)));
});
