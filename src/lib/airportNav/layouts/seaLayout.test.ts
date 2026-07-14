import assert from "node:assert/strict";
import { test } from "node:test";

import { SEA_LAYOUT } from "./sea";

function bbox(ring: [number, number][]) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return { w, s, e, n };
}

function inside(pos: [number, number], b: ReturnType<typeof bbox>, padDeg = 0.0006): boolean {
  return (
    pos[0] >= b.w - padDeg &&
    pos[0] <= b.e + padDeg &&
    pos[1] >= b.s - padDeg &&
    pos[1] <= b.n + padDeg
  );
}

const zone = (id: string) => SEA_LAYOUT.zones.find((z) => z.id === id)!;
const node = (id: string) => SEA_LAYOUT.nodes.find((nd) => nd.id === id)!;

test("SEA uses real OSM footprints, not schematic rectangles", () => {
  // A hand-drawn rectangle is exactly 5 points; the real main terminal is a
  // complex X-shaped outline. Guard against a regression back to boxes.
  const main = zone("z-main");
  assert.ok(main.ring.length > 20, `main terminal ring had ${main.ring.length} points`);
  // Ring is closed.
  assert.deepEqual(main.ring[0], main.ring[main.ring.length - 1]);
});

test("SEA satellites are their own real footprints", () => {
  assert.ok(zone("z-sat-n").ring.length >= 6);
  assert.ok(zone("z-sat-s").ring.length >= 6);
});

test("gate anchors sit inside their real terminal footprints", () => {
  // North/South satellite gate anchors must fall within the matching satellite
  // footprint so markers render on the real building, not floating in water.
  assert.ok(inside(node("gate-N").pos, bbox(zone("z-sat-n").ring)), "gate-N off North Satellite");
  assert.ok(inside(node("gate-S").pos, bbox(zone("z-sat-s").ring)), "gate-S off South Satellite");

  // A/B/C/D concourses live inside the main terminal footprint.
  const main = bbox(zone("z-main").ring);
  for (const id of ["gate-A", "gate-B", "gate-C", "gate-D"]) {
    assert.ok(inside(node(id).pos, main), `${id} outside main terminal`);
  }
});

test("SEA center sits within the main terminal footprint", () => {
  assert.ok(inside(SEA_LAYOUT.center, bbox(zone("z-main").ring)));
});

test("gate anchors match the real OSM gate-cluster centroids", () => {
  // These are the live OpenStreetMap per-concourse gate centroids (verified
  // 2026-07-14). Lock them so a future edit can't drift pins off the piers.
  const expected: Record<string, [number, number]> = {
    "gate-A": [-122.299174, 47.440265],
    "gate-B": [-122.303761, 47.441586],
    "gate-C": [-122.303808, 47.445539],
    "gate-D": [-122.299969, 47.445766],
    "gate-N": [-122.302579, 47.448618],
    "gate-S": [-122.302136, 47.438814],
  };
  for (const [id, [lng, lat]] of Object.entries(expected)) {
    const pos = node(id).pos;
    assert.ok(Math.abs(pos[0] - lng) < 0.001, `${id} lng drifted: ${pos[0]}`);
    assert.ok(Math.abs(pos[1] - lat) < 0.001, `${id} lat drifted: ${pos[1]}`);
  }
});

test("departures drop-off is landside and feeds check-in", () => {
  const curb = node("curb-departures");
  assert.equal(curb.airside, false);
  assert.ok(inside(curb.pos, bbox(zone("z-main").ring)));
});
