import { test } from "node:test";
import assert from "node:assert/strict";

import { SEA_LAYOUT } from "./sea";

/**
 * Ground-truth regression guard (KEPI_DESIGN_LAW M26).
 *
 * A curated node's real [lng, lat] IS its marker position on the live map
 * (rendered via `.setLngLat(pos)` with no separate projection). The previous
 * guard tested nodes against SEA_OSM_FOOTPRINTS.mainTerminal — a simplified,
 * auto-derived ring — as a pass/fail gate. That was wrong: a REAL door
 * coordinate can fall just outside that decorative ring (Door 4 does), so the
 * polygon test would reject verified ground truth. We now assert the opposite,
 * correct thing: each landside node matches the REAL OpenStreetMap door
 * coordinate it was verified against (Overpass `entrance` ref nodes, satellite-
 * aligned), and the airline sections are in the real north→south order.
 *
 * DOOR_GROUND_TRUTH values are read from OSM, not estimated. If SEA's doors are
 * ever re-surveyed, update these from OSM and the node coords together.
 */

// Real OSM entrance `ref` door coordinates [lng, lat], verified 2026-07-14.
const DOOR_GROUND_TRUTH: Record<string, [number, number]> = {
  "Door 4": [-122.300184, 47.442272],
  "Door 12": [-122.301487, 47.443169],
  "Door 14": [-122.301777, 47.443522],
  "Door 24": [-122.300607, 47.444651],
};

// Which landside node is anchored to which real door.
const NODE_DOOR: Record<string, string> = {
  "curb-departures": "Door 14",
  "checkin-south": "Door 4",
  "checkin-center": "Door 12",
  "checkin-north": "Door 24",
};

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

test("every landside node matches its real OSM door coordinate (ground truth, not the ring)", () => {
  const byId = new Map(SEA_LAYOUT.nodes.map((n) => [n.id, n]));
  const offenders: string[] = [];
  for (const [nodeId, doorKey] of Object.entries(NODE_DOOR)) {
    const node = byId.get(nodeId);
    assert.ok(node, `missing node ${nodeId}`);
    const truth = DOOR_GROUND_TRUTH[doorKey];
    const dist = haversineMeters(node!.pos, truth);
    if (dist > 25) {
      offenders.push(`${nodeId} is ${dist.toFixed(0)}m from ${doorKey} ${JSON.stringify(truth)}`);
    }
  }
  assert.equal(offenders.length, 0, `nodes drifted from their verified OSM door:\n  ${offenders.join("\n  ")}`);
});

test("check-in sections run in the real north→south order (Alaska north)", () => {
  const byId = new Map(SEA_LAYOUT.nodes.map((n) => [n.id, n]));
  const north = byId.get("checkin-north")!;
  const center = byId.get("checkin-center")!;
  const south = byId.get("checkin-south")!;
  assert.ok(north.pos[1] > center.pos[1], "checkin-north must be north of checkin-center");
  assert.ok(center.pos[1] > south.pos[1], "checkin-center must be north of checkin-south");

  // Alaska must be on the NORTH node (the old file had it flipped to the south).
  const alaska = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "AS");
  assert.ok(alaska, "Alaska check-in POI must exist");
  assert.equal(alaska!.nodeId, "checkin-north", "Alaska check-in must anchor to the north ticketing node");
});
