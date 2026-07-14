import { test } from "node:test";
import assert from "node:assert/strict";

import { interpolateDoorPosition, type DoorAnchor } from "./doorCurve";

// The 5 REAL OSM anchor doors for SEA (Overpass entrance `ref`, verified 2026-07-14).
const ANCHORS: DoorAnchor[] = [
  { door: 4, lng: -122.300184, lat: 47.442272 },
  { door: 12, lng: -122.301487, lat: 47.443169 },
  { door: 14, lng: -122.301777, lat: 47.443522 },
  { door: 22, lng: -122.300868, lat: 47.444474 },
  { door: 24, lng: -122.300607, lat: 47.444651 },
];

function meters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

test("reproduces every anchor door exactly and marks it surveyed", () => {
  for (const a of ANCHORS) {
    const r = interpolateDoorPosition(ANCHORS, a.door);
    assert.equal(r.grade, "surveyed");
    assert.equal(r.pos[0], a.lng);
    assert.equal(r.pos[1], a.lat);
  }
});

test("interpolates a between-anchor door and marks it schematic", () => {
  // Door 13 sits halfway between anchors 12 and 14 → the average of the two.
  const r = interpolateDoorPosition(ANCHORS, 13);
  assert.equal(r.grade, "schematic");
  const expected: [number, number] = [
    (ANCHORS[1].lng + ANCHORS[2].lng) / 2,
    (ANCHORS[1].lat + ANCHORS[2].lat) / 2,
  ];
  assert.ok(meters(r.pos, expected) < 1, `door 13 off by ${meters(r.pos, expected)}m`);
});

test("interpolated door 17 lands between anchors 14 and 22, on the real facade", () => {
  const r = interpolateDoorPosition(ANCHORS, 17);
  assert.equal(r.grade, "schematic");
  // Must sit between the two bracketing anchors' coordinates.
  assert.ok(r.pos[0] > ANCHORS[2].lng && r.pos[0] < ANCHORS[3].lng, "lng between doors 14 and 22");
  assert.ok(r.pos[1] > ANCHORS[2].lat && r.pos[1] < ANCHORS[3].lat, "lat between doors 14 and 22");
  // Sanity: within ~150m of both bracketing anchors (they're ~100m apart).
  assert.ok(meters(r.pos, [ANCHORS[2].lng, ANCHORS[2].lat]) < 150);
  assert.ok(meters(r.pos, [ANCHORS[3].lng, ANCHORS[3].lat]) < 150);
});

test("doors outside the anchor span are flagged extrapolated (lower confidence)", () => {
  assert.equal(interpolateDoorPosition(ANCHORS, 3).grade, "extrapolated"); // below 4
  assert.equal(interpolateDoorPosition(ANCHORS, 26).grade, "extrapolated"); // above 24
  // Extrapolation stays near the terminal, not miles away.
  const d3 = interpolateDoorPosition(ANCHORS, 3);
  assert.ok(meters(d3.pos, [ANCHORS[0].lng, ANCHORS[0].lat]) < 60, "door 3 stays near door 4");
});

test("anchors need not be pre-sorted", () => {
  const shuffled = [ANCHORS[3], ANCHORS[0], ANCHORS[4], ANCHORS[1], ANCHORS[2]];
  const r = interpolateDoorPosition(shuffled, 12);
  assert.equal(r.grade, "surveyed");
  assert.equal(r.pos[0], ANCHORS[1].lng);
});
