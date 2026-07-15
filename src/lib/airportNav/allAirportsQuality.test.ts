import { test } from "node:test";
import assert from "node:assert/strict";

import { SEA_LAYOUT } from "./layouts/sea";
import type { AirportLayout } from "./types";
import { auditLayoutRouting } from "./layoutQuality";

/**
 * KEPI_DESIGN_LAW M29 — every bundled airport layout must pass the generic
 * routing-quality audit (reachability + no-backtrack + coordinate sanity).
 *
 * This test iterates ALL bundled layouts, so adding a new airport automatically
 * inherits the SEA lessons: a new layout that reintroduces the star-hub zigzag,
 * an orphaned destination, or a stray coordinate fails the build here — before
 * it can be published.
 *
 * When registering a new airport, add it to ALL_LAYOUTS below (mirrors
 * getLayout.ts LAYOUTS). Keep this list in sync with the bundled registry.
 */
const ALL_LAYOUTS: AirportLayout[] = [SEA_LAYOUT];

for (const layout of ALL_LAYOUTS) {
  test(`${layout.iata} layout passes generic routing-quality audit`, () => {
    const report = auditLayoutRouting(layout);
    assert.equal(
      report.errors.length,
      0,
      `${layout.iata} has routing-quality errors:\n  - ${report.errors.join("\n  - ")}`,
    );
  });
}
