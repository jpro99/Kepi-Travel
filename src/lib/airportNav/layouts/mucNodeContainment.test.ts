import { test } from "node:test";
import assert from "node:assert/strict";
import { MUC_LAYOUT } from "./muc";
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
  "gate-a": [11.781489, 48.356041],
  "gate-g": [11.79238, 48.353218],
  "gate-k": [11.798582, 48.354831],
  "curb-t1": [11.781907, 48.353573],
  "curb-t2": [11.791344, 48.354214],
  "lounge-sen-sat": [11.799122, 48.355553],
};

test("MUC gate + curb + lounge nodes match real OSM coordinates", () => {
  const byId = new Map(MUC_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing ${id}`);
    assert.ok(metersBetween(node!.pos, truth) <= 5, `${id} drifted`);
  }
});

test("MUC satellite is airside-only (no landside curb)", () => {
  assert.equal(MUC_LAYOUT.nodes.some((n) => n.id === "curb-sat"), false);
  assert.ok(MUC_LAYOUT.edges.some((e) => e.id === "e-train-t2-sat" && e.kind === "train"));
});

test("MUC layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(MUC_LAYOUT));
});
