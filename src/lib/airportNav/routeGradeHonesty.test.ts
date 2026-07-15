import { test } from "node:test";
import assert from "node:assert/strict";
import { listAllBundledLayouts } from "./getLayout";

/**
 * KEPI_DESIGN_LAW M30 — honesty gate for drawn walking routes.
 *
 * Layouts come from listAllBundledLayouts() — registering in getLayout.ts is
 * enough. Until Phase 2 rebuilds an airport on real footways, it MUST NOT claim
 * routeGrade: "surveyed".
 */
for (const layout of listAllBundledLayouts()) {
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
  for (const layout of listAllBundledLayouts()) {
    assert.ok(
      layout.routeGrade === undefined || layout.routeGrade === "schematic" || layout.routeGrade === "surveyed",
      `${layout.iata} has an invalid routeGrade: ${String(layout.routeGrade)}`,
    );
  }
});
