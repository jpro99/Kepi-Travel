import { test } from "node:test";
import assert from "node:assert/strict";
import { VCE_LAYOUT } from "./vce";
import { parseAirportLayout } from "../airportLayoutPackage";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Overpass 2026-07-17 OSM gate-cluster centroids. */
const GROUND_TRUTH: Record<string, [number, number]> = {
  "gate-main": [12.341236, 45.50468],
  "gate-b": [12.341159, 45.505604],
  "curb-main": [12.340383, 45.503643],
};

test("VCE gate + curb nodes match real OSM coordinates", () => {
  const byId = new Map(VCE_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing ${id}`);
    assert.ok(metersBetween(node!.pos, truth) <= 5, `${id} drifted`);
  }
});

test("VCE layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(VCE_LAYOUT));
});
