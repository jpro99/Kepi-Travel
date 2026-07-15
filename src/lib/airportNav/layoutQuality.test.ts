import { test } from "node:test";
import assert from "node:assert/strict";

import { SEA_LAYOUT } from "./layouts/sea";
import type { AirportLayout } from "./types";
import { auditLayoutRouting, MAX_NODE_DISTANCE_FROM_CENTER_M } from "./layoutQuality";

/**
 * KEPI_DESIGN_LAW M29 — proves the generic auditor CATCHES the SEA failure modes,
 * so the same class of bug cannot ship on any future airport.
 */

test("clean SEA layout has no routing-quality errors", () => {
  const report = auditLayoutRouting(SEA_LAYOUT);
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
});

test("catches an unreachable journey destination (orphaned gate)", () => {
  const broken: AirportLayout = structuredClone(SEA_LAYOUT);
  const gate = broken.pois.find((p) => p.category === "gate");
  assert.ok(gate);
  // Cut every edge touching the gate's node — the classic "star-hub" orphan.
  broken.edges = broken.edges.filter((e) => e.from !== gate!.nodeId && e.to !== gate!.nodeId);
  const report = auditLayoutRouting(broken);
  assert.ok(
    report.errors.some((e) => e.includes("unreachable")),
    `expected an unreachable-destination error, got:\n${report.errors.join("\n")}`,
  );
});

test("catches a stray coordinate (wrong-city / ocean node)", () => {
  const broken: AirportLayout = structuredClone(SEA_LAYOUT);
  // Shove one node far out to sea, well past the sanity radius.
  const offsetDeg = (MAX_NODE_DISTANCE_FROM_CENTER_M / 111_320) * 2;
  broken.nodes[0] = {
    ...broken.nodes[0],
    pos: [broken.center[0], broken.center[1] + offsetDeg],
  };
  const report = auditLayoutRouting(broken);
  assert.ok(
    report.errors.some((e) => e.includes("km from the airport center")),
    `expected a stray-coordinate error, got:\n${report.errors.join("\n")}`,
  );
});

test("contextual pins (amenities) unreachable → warning, not a ship-blocker", () => {
  const report = auditLayoutRouting(SEA_LAYOUT);
  // SEA's amenities are display-only pins with no edges; they must NOT be errors.
  assert.equal(report.errors.length, 0);
  assert.ok(
    report.warnings.some((w) => w.includes("contextual pin")),
    "expected amenity disconnection to surface as a warning",
  );
});
