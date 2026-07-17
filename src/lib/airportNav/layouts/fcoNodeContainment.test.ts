import { test } from "node:test";
import assert from "node:assert/strict";
import { FCO_LAYOUT } from "./fco";
import { parseAirportLayout } from "../airportLayoutPackage";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Overpass 2026-07-17 OSM centroids. */
const GROUND_TRUTH: Record<string, [number, number]> = {
  "gate-a": [12.257183, 41.79679],
  "gate-e": [12.245506, 41.796099],
  "curb-t1": [12.255352, 41.79521],
  "curb-t3": [12.250329, 41.795574],
};

test("FCO gate + curb nodes match real OSM coordinates", () => {
  const byId = new Map(FCO_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing ${id}`);
    assert.ok(metersBetween(node!.pos, truth) <= 5, `${id} drifted`);
  }
});

test("FCO layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(FCO_LAYOUT));
});
