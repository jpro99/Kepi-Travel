import { test } from "node:test";
import assert from "node:assert/strict";
import { BRI_LAYOUT } from "./bri";
import { parseAirportLayout } from "../airportLayoutPackage";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Overpass 2026-07-17 OSM gate-cluster centroids (name tags A… / B…). */
const GROUND_TRUTH: Record<string, [number, number]> = {
  "gate-a": [16.764503, 41.134981],
  "gate-b": [16.762816, 41.134477],
  "curb-main": [16.76418, 41.134554],
};

test("BRI gate + curb nodes match real OSM coordinates", () => {
  const byId = new Map(BRI_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing ${id}`);
    assert.ok(metersBetween(node!.pos, truth) <= 5, `${id} drifted`);
  }
});

test("BRI layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(BRI_LAYOUT));
});
