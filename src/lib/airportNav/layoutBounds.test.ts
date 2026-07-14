import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLayoutBounds, computeLandsideBounds, layoutSpanMeters } from "./layoutBounds";
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

test("computeLandsideBounds frames only the landside terminal, not airside satellites", () => {
  const l = layout(); // z1 is airside
  // Landside main terminal.
  l.zones.push({
    id: "z-main",
    name: "Main Terminal",
    ring: [
      [-122.305, 47.442],
      [-122.301, 47.442],
      [-122.301, 47.446],
      [-122.305, 47.446],
      [-122.305, 47.442],
    ],
    airside: false,
    heightM: 14,
  });
  // A far-north airside satellite that would blow up the full-layout bounds.
  l.zones.push({
    id: "z-sat",
    name: "North Satellite",
    ring: [
      [-122.304, 47.49],
      [-122.302, 47.49],
      [-122.302, 47.492],
      [-122.304, 47.492],
      [-122.304, 47.49],
    ],
    airside: true,
    heightM: 11,
  });

  const landside = computeLandsideBounds(l)!;
  assert.equal(landside[0][0], -122.305);
  assert.equal(landside[1][0], -122.301);
  assert.equal(landside[0][1], 47.442);
  assert.equal(landside[1][1], 47.446, "landside bounds must exclude the far-north satellite");

  // And it is tighter than the full-airport bounds.
  const full = computeLayoutBounds(l)!;
  assert.ok(full[1][1] > landside[1][1], "full bounds reach the satellite; landside bounds do not");
});

test("computeLandsideBounds falls back to full bounds when no landside zone exists", () => {
  const l = layout(); // only an airside zone
  const landside = computeLandsideBounds(l)!;
  const full = computeLayoutBounds(l)!;
  assert.deepEqual(landside, full);
});

test("layoutSpanMeters reports a plausible terminal-scale span", () => {
  const span = layoutSpanMeters([
    [-122.31, 47.44],
    [-122.29, 47.46],
  ]);
  // ~2.2 km north-south at this latitude — sane order of magnitude.
  assert.ok(span > 1500 && span < 3000, `span was ${span}`);
});
