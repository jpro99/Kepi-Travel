import { test } from "node:test";
import assert from "node:assert/strict";
import { SEA_LAYOUT } from "./layouts/sea";
import { LAX_LAYOUT } from "./layouts/lax";
import { ONT_LAYOUT } from "./layouts/ont";
import type { AirportLayout } from "./types";

/**
 * KEPI_DESIGN_LAW M30 — honesty gate for drawn walking routes.
 *
 * Our bundled graphs are still straight-line skeletons between estimated
 * curb/security/gate anchors (the OSM importer does not yet pull real
 * footways/entrances). Until an airport's graph is rebuilt from verified
 * corridors (Phase 2), it MUST NOT claim `routeGrade: "surveyed"` — otherwise
 * the map would paint a confident line that cuts through buildings/parking.
 *
 * When Phase 2 rebuilds an airport on real footways, flip its routeGrade to
 * "surveyed" AND remove it from this guard in the same change — a conscious,
 * reviewed step, never an accident.
 */
const SCHEMATIC_UNTIL_PHASE2: AirportLayout[] = [SEA_LAYOUT, LAX_LAYOUT, ONT_LAYOUT];

for (const layout of SCHEMATIC_UNTIL_PHASE2) {
  test(`${layout.iata} does not falsely claim a surveyed walking route`, () => {
    assert.notEqual(
      layout.routeGrade,
      "surveyed",
      `${layout.iata} is labeled routeGrade:"surveyed" but its graph is still a ` +
        `schematic skeleton. Either rebuild it from real OSM footways (Phase 2) ` +
        `or leave routeGrade unset/"schematic" so the map shows pins + an estimate, ` +
        `not a straight-line route (M30).`,
    );
  });
}

test("routeGrade only ever takes the two honest values", () => {
  for (const layout of SCHEMATIC_UNTIL_PHASE2) {
    assert.ok(
      layout.routeGrade === undefined || layout.routeGrade === "schematic" || layout.routeGrade === "surveyed",
      `${layout.iata} has an invalid routeGrade: ${String(layout.routeGrade)}`,
    );
  }
});
