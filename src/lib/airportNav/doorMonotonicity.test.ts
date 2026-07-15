import { test } from "node:test";
import assert from "node:assert/strict";

import { findMonotonicityOutliers, type DoorAnchor } from "./doorCurve";
import { SEA_DOOR_ANCHORS } from "./layouts/seaTicketingHall";
import { doorAnchorsFromOsmElements, type OsmElement } from "./osmImport";

/**
 * KEPI_DESIGN_LAW M36 — door-ref monotonicity.
 * Regression for the SEA Door 24 mis-tag: a real OSM entrance with a wrong
 * ordinal must be caught by code, not another manual rematch session.
 */

test("SEA's current 5 real door anchors are monotonically ordered", () => {
  assert.deepEqual(
    findMonotonicityOutliers(SEA_DOOR_ANCHORS).map((a) => a.door),
    [],
    "SEA_DOOR_ANCHORS (4/12/14/20/22) must pass — they were rematched 2026-07-15",
  );
});

test("synthetic mid-facade Door 24 (old SEA bad pattern) is flagged as an outlier", () => {
  // Good south→north facade (door number rises with position), then a "Door 24"
  // dropped mid-facade — the exact failure mode that poisoned SEA's old curve.
  const good: DoorAnchor[] = [
    { door: 4, lng: -122.300257, lat: 47.4422245 },
    { door: 12, lng: -122.3012498, lat: 47.4429006 },
    { door: 14, lng: -122.301817, lat: 47.4432645 },
    { door: 20, lng: -122.3014823, lat: 47.444138 },
    { door: 22, lng: -122.3008676, lat: 47.4444743 },
  ];
  const bad24: DoorAnchor = { door: 24, lng: -122.3015604, lat: 47.4431241 }; // mid-facade OSM ref=24
  const outliers = findMonotonicityOutliers([...good, bad24]);
  assert.ok(
    outliers.some((a) => a.door === 24),
    `Expected door 24 to be flagged, got doors: ${outliers.map((a) => a.door).join(",")}`,
  );
});

test("fewer than 3 anchors cannot be judged — returns empty", () => {
  assert.deepEqual(
    findMonotonicityOutliers([
      { door: 1, lng: 0, lat: 0 },
      { door: 2, lng: 1, lat: 1 },
    ]),
    [],
  );
});

test("doorAnchorsFromOsmElements only keeps numeric entrance refs", () => {
  const elements: OsmElement[] = [
    { type: "node", id: 1, lat: 47.44, lon: -122.3, tags: { entrance: "yes", ref: "4" } },
    { type: "node", id: 2, lat: 47.45, lon: -122.31, tags: { entrance: "yes", ref: "A" } },
    { type: "node", id: 3, lat: 47.46, lon: -122.32, tags: { entrance: "main" } },
  ];
  assert.deepEqual(doorAnchorsFromOsmElements(elements), [
    { door: 4, lng: -122.3, lat: 47.44 },
  ]);
});
