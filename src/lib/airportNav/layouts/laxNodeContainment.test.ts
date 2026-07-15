import { test } from "node:test";
import assert from "node:assert/strict";

import { LAX_LAYOUT } from "./lax";
import { parseAirportLayout } from "../airportLayoutPackage";

/**
 * KEPI_DESIGN_LAW M26/M28/M29 — LAX ground-truth guard.
 *
 * Every gate-cluster node and lounge below is a REAL OpenStreetMap coordinate
 * (Overpass, verified 2026-07-14). This test pins them so an accidental edit
 * can't silently drift a pin onto the tarmac or the wrong terminal. Curbs and
 * checkpoints are deliberately NOT pinned here — they are honest estimates
 * (OSM has no LAX checkpoint/curb tagging, M15).
 */

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

// SURVEYED — real OSM gate-cluster centroids + lounges.
const GROUND_TRUTH: Record<string, [number, number]> = {
  "gate-t1": [-118.401360, 33.946924],
  "gate-t2": [-118.404026, 33.946612],
  "gate-t3": [-118.407328, 33.946341],
  "gate-tbit": [-118.410351, 33.943147],
  "gate-t4": [-118.406761, 33.940540],
  "gate-t6": [-118.402012, 33.941091],
  "gate-t7": [-118.399665, 33.941496],
  "gate-t8": [-118.397482, 33.941942],
  "gate-west": [-118.414412, 33.941113],
  "lounge-centurion": [-118.409300, 33.942870],
  "lounge-polaris": [-118.399869, 33.941353],
};

test("LAX gate + lounge nodes match real OSM coordinates (no drift onto tarmac)", () => {
  const byId = new Map(LAX_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, truth] of Object.entries(GROUND_TRUTH)) {
    const node = byId.get(id);
    assert.ok(node, `missing node ${id}`);
    const drift = metersBetween(node!.pos, truth);
    assert.ok(drift <= 5, `${id} drifted ${drift.toFixed(1)} m from its OSM coordinate`);
  }
});

test("LAX horseshoe orientation: north-arm gates north of their curb, south-arm south", () => {
  const byId = new Map(LAX_LAYOUT.nodes.map((n) => [n.id, n]));
  const northArm = ["t1", "t2", "t3"];
  const southArm = ["t4", "t6", "t7", "t8"];
  for (const t of northArm) {
    assert.ok(byId.get(`gate-${t}`)!.pos[1] > byId.get(`curb-${t}`)!.pos[1], `${t} gates should be north of curb`);
  }
  for (const t of southArm) {
    assert.ok(byId.get(`gate-${t}`)!.pos[1] < byId.get(`curb-${t}`)!.pos[1], `${t} gates should be south of curb`);
  }
});

test("LAX layout passes schema + graph validation", () => {
  assert.doesNotThrow(() => parseAirportLayout(LAX_LAYOUT));
});
