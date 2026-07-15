import { test } from "node:test";
import assert from "node:assert/strict";

import { listAllBundledLayouts } from "./getLayout";
import { auditLayoutRouting } from "./layoutQuality";

/**
 * KEPI_DESIGN_LAW M29 — every bundled airport layout must pass the generic
 * routing-quality audit (reachability + no-backtrack + coordinate sanity).
 *
 * Layouts come from listAllBundledLayouts() — registering in getLayout.ts is
 * enough; do not maintain a second ALL_LAYOUTS array here.
 */
for (const layout of listAllBundledLayouts()) {
  test(`${layout.iata} layout passes generic routing-quality audit`, () => {
    const report = auditLayoutRouting(layout);
    assert.equal(
      report.errors.length,
      0,
      `${layout.iata} has routing-quality errors:\n  - ${report.errors.join("\n  - ")}`,
    );
  });
}
