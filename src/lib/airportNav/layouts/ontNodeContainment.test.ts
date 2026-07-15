import { test } from "node:test";
import assert from "node:assert/strict";

import { ONT_LAYOUT } from "./ont";
import { parseAirportLayout } from "../airportLayoutPackage";

/**
 * KEPI_DESIGN_LAW M26/M29 — ONT ground-truth guard. Gate clusters + the Aspire
 * lounge are real OSM coordinates (Overpass, verified 2026-07-15); pin them so
 * an edit can't drift them onto the apron. Curbs/checkpoints are honest
 * estimates (OSM has no ONT checkpoint tagging, M15) and are not pinned.
 */

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

const GROUND_TRUTH: Record<string, [number, number]> = {
  "gate-t2": [-117.597375, 34.060146],
  "gate-t4": [-117.587336, 34.060158],
  "lounge-aspire": [-117.596516, 34.060242],
};

test("ONT gate + lounge nodes match real OSM coordinates", () => {
  const byId = new Map(ONT_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing node ${id}`);
    const drift = metersBetween(node!.pos, truth);
    assert.ok(drift <= 5, `${id} drifted ${drift.toFixed(1)} m from its OSM coordinate`);
  }
});

test("ONT gates sit south of their curb (gates face the apron)", () => {
  const byId = new Map(ONT_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const t of ["t2", "t4"]) {
    assert.ok(
      byId.get(`gate-${t}`)!.pos[1] < byId.get(`curb-${t}`)!.pos[1],
      `${t} gates should be south of curb`,
    );
  }
});

test("ONT layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(ONT_LAYOUT));
});
