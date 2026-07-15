import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReferenceImageDraft, buildAffineFromControlPairs } from "./referenceImageDraft";
import type { AirportLayout } from "./types";

const baseLayout: AirportLayout = {
  iata: "TST",
  name: "Test",
  layoutVersion: "1",
  updatedAt: "2026-07-15",
  center: [0, 0],
  zones: [{ id: "z", name: "z", ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], airside: false, heightM: 10 }],
  nodes: [
    { id: "a", pos: [-122.3, 47.44], kind: "door", airside: false },
    { id: "b", pos: [-122.31, 47.45], kind: "door", airside: false },
    { id: "c", pos: [-122.29, 47.45], kind: "door", airside: false },
  ],
  edges: [{ id: "e1", from: "a", to: "b", kind: "walkway", lengthM: 10, traverseSeconds: 8, bidirectional: true }],
  pois: [
    { id: "poi-a", nodeId: "a", category: "checkin", name: "Anchor A", precision: "surveyed" },
  ],
  gateNodeResolver: [],
};

test("applyReferenceImageDraft projects pixels as schematic/extrapolated — never surveyed", () => {
  const pairs = [
    { pixel: [0, 0] as [number, number], world: [-122.3, 47.44] as [number, number] },
    { pixel: [100, 0] as [number, number], world: [-122.31, 47.45] as [number, number] },
    { pixel: [0, 100] as [number, number], world: [-122.29, 47.45] as [number, number] },
  ];
  const transform = buildAffineFromControlPairs(pairs);
  assert.ok(transform);
  const worldAnchors = pairs.map((p) => p.world);
  const next = applyReferenceImageDraft(baseLayout, transform!, worldAnchors, [
    {
      pixel: [50, 50],
      name: "Draft Airline",
      category: "checkin",
      airlineIataCode: "XX",
      airline: "Draft Air",
    },
  ]);
  assert.equal(next.pois.length, baseLayout.pois.length + 1);
  const draft = next.pois.find((p) => p.airlineIataCode === "XX");
  assert.ok(draft);
  assert.ok(draft!.precision === "schematic" || draft!.precision === "extrapolated");
  assert.notEqual(draft!.precision, "surveyed");
});
