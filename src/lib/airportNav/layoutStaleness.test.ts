import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT_STALENESS_DAYS,
  daysSinceVerified,
  isLayoutStale,
  layoutStalenessStatus,
} from "./layoutStaleness";

test("LAYOUT_STALENESS_DAYS is the named 6-month default", () => {
  assert.equal(LAYOUT_STALENESS_DAYS, 180);
});

test("fresh / aging / stale thresholds from lastVerifiedAt", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  assert.equal(layoutStalenessStatus("2026-07-01", now), "fresh");
  assert.equal(layoutStalenessStatus("2026-01-20", now), "aging"); // ~176 days
  assert.equal(layoutStalenessStatus("2025-12-01", now), "stale");
  assert.equal(layoutStalenessStatus(null, now), "unknown");
  assert.equal(daysSinceVerified("2026-07-10", now), 5);
  assert.equal(isLayoutStale("2025-01-01", now), true);
  assert.equal(isLayoutStale("2026-07-01", now), false);
});
