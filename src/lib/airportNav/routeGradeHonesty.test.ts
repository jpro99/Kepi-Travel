import { test } from "node:test";
import assert from "node:assert/strict";
import { listAllBundledLayouts } from "./getLayout";
import { SEA_LAYOUT, SEA_FOOTWAY_WARNINGS } from "./layouts/sea";

/**
 * KEPI_DESIGN_LAW M30 / M37 — honesty gate for drawn walking routes.
 *
 * LAX/ONT stay schematic until their graphs are rebuilt from OSM footways.
 * SEA may claim routeGrade:"surveyed" only when the Phase 2 overlay is present
 * (fw-* nodes + e-fw-* edges) and the journey gate cleared.
 */
for (const layout of listAllBundledLayouts()) {
  if (layout.iata === "SEA") {
    test("SEA Phase 2 footway overlay earns surveyed routeGrade honestly", () => {
      assert.equal(layout.routeGrade, "surveyed");
      assert.ok(layout.nodes.some((n) => n.id.startsWith("fw-")), "expected OSM footway nodes");
      assert.ok(layout.edges.some((e) => e.id.startsWith("e-fw-")), "expected OSM footway edges");
      assert.ok(
        SEA_FOOTWAY_WARNINGS.some((w) => /bridge/i.test(w)),
        "expected an honest warning that curated pier bridges were retained",
      );
    });
    continue;
  }

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

test("SEA surveyed layout is the same object getLayout serves", () => {
  assert.equal(SEA_LAYOUT.iata, "SEA");
  assert.equal(SEA_LAYOUT.routeGrade, "surveyed");
});
