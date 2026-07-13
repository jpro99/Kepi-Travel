import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLayoutBounds, layoutSpanMeters } from "./layoutBounds";
import type { AirportLayout } from "./types";

function layout(overrides: Partial<AirportLayout> = {}): AirportLayout {
  return {
    iata: "TST",
    name: "Test",
    layoutVersion: "1",
    updatedAt: "2026-07-13",
    center: [0, 0],
    zones: [
      {
        id: "z1",
        name: "Concourse",
        ring: [
          [-122.31, 47.44],
          [-122.29, 47.44],
          [-122.29, 47.46],
          [-122.31, 47.46],
          [-122.31, 47.44],
        ],
        airside: true,
        heightM: 12,
      },
    ],
    nodes: [],
    edges: [],
    pois: [],
    ...overrides,
  } as AirportLayout;
}

test("computeLayoutBounds covers every zone ring vertex", () => {
  const bounds = computeLayoutBounds(layout());
  assert.ok(bounds);
  const [[west, south], [east, north]] = bounds!;
  assert.equal(west, -122.31);
  assert.equal(east, -122.29);
  assert.equal(south, 47.44);
  assert.equal(north, 47.46);
});

test("computeLayoutBounds spans multiple zones", () => {
  const l = layout();
  l.zones.push({
    id: "z2",
    name: "North",
    ring: [
      [-122.35, 47.5],
      [-122.33, 47.5],
      [-122.33, 47.52],
      [-122.35, 47.52],
      [-122.35, 47.5],
    ],
    airside: false,
    heightM: 10,
  });
  const bounds = computeLayoutBounds(l)!;
  assert.equal(bounds[0][0], -122.35);
  assert.equal(bounds[1][1], 47.52);
});

test("computeLayoutBounds falls back to node positions when zones lack geometry", () => {
  const l = layout({ zones: [] });
  l.nodes = [
    { id: "a", pos: [-122.3, 47.45], kind: "junction", airside: false },
    { id: "b", pos: [-122.28, 47.47], kind: "junction", airside: true },
  ] as AirportLayout["nodes"];
  const bounds = computeLayoutBounds(l)!;
  assert.equal(bounds[0][0], -122.3);
  assert.equal(bounds[1][0], -122.28);
});

test("computeLayoutBounds returns null with no geometry at all", () => {
  assert.equal(computeLayoutBounds(layout({ zones: [], nodes: [] })), null);
});

test("layoutSpanMeters reports a plausible terminal-scale span", () => {
  const span = layoutSpanMeters([
    [-122.31, 47.44],
    [-122.29, 47.46],
  ]);
  // ~2.2 km north-south at this latitude — sane order of magnitude.
  assert.ok(span > 1500 && span < 3000, `span was ${span}`);
});
