import { test } from "node:test";
import assert from "node:assert/strict";
import { SEA_LAYOUT } from "./layouts/sea";
import { LAX_LAYOUT } from "./layouts/lax";
import { ONT_LAYOUT } from "./layouts/ont";
import { validateAirportLayoutGraph } from "./airportLayoutPackage";
import type { AirportLayout } from "./types";

/**
 * KEPI_DESIGN_LAW M31 + M32 — structural ground-truth invariants that hold for
 * EVERY airport in the registry, enforced in shared code (validateAirportLayoutGraph),
 * never special-cased per IATA.
 *
 *  M31 — landside↔airside may only be crossed through a `security_transition`
 *        edge, so "security past the gates" / a sterile-area bypass is impossible
 *        in the data, not merely wrong on the map.
 *  M32 — a `security` POI may never claim `precision: "surveyed"` — checkpoints
 *        have zero public ground truth anywhere and stay permanently approximate.
 */

const ALL_LAYOUTS: AirportLayout[] = [SEA_LAYOUT, LAX_LAYOUT, ONT_LAYOUT];

for (const layout of ALL_LAYOUTS) {
  test(`${layout.iata} obeys landside/airside topology + security-approximate invariants`, () => {
    const issues = validateAirportLayoutGraph(layout);
    const topology = issues.filter((i) => i.includes("(M31)"));
    const security = issues.filter((i) => i.includes("(M32)"));
    assert.equal(
      topology.length,
      0,
      `${layout.iata} crosses landside↔airside without a security_transition:\n  - ${topology.join("\n  - ")}`,
    );
    assert.equal(
      security.length,
      0,
      `${layout.iata} claims survey-grade precision for a security checkpoint:\n  - ${security.join("\n  - ")}`,
    );
  });
}

test("M31 — a direct landside→airside walkway is rejected", () => {
  const bad: AirportLayout = {
    iata: "TST",
    name: "Test",
    layoutVersion: "test",
    updatedAt: "2026-07-15",
    center: [0, 0],
    zones: [{ id: "z1", name: "Z", ring: [[0, 0], [0, 1], [1, 1], [0, 0]], airside: false, heightM: 10 }],
    nodes: [
      { id: "landside", pos: [0, 0], kind: "junction", airside: false },
      { id: "airside", pos: [0, 1], kind: "gate", airside: true },
    ],
    edges: [
      { id: "e1", from: "landside", to: "airside", kind: "walkway", lengthM: 50, traverseSeconds: 40, bidirectional: true },
    ],
    pois: [{ id: "p1", nodeId: "airside", category: "gate", name: "Gate 1" }],
    gateNodeResolver: [],
  };
  const issues = validateAirportLayoutGraph(bad);
  assert.ok(
    issues.some((i) => i.includes("(M31)")),
    `Expected an M31 violation, got:\n  - ${issues.join("\n  - ")}`,
  );
});

test("M32 — a surveyed security POI is rejected", () => {
  const bad: AirportLayout = {
    iata: "TST",
    name: "Test",
    layoutVersion: "test",
    updatedAt: "2026-07-15",
    center: [0, 0],
    zones: [{ id: "z1", name: "Z", ring: [[0, 0], [0, 1], [1, 1], [0, 0]], airside: false, heightM: 10 }],
    nodes: [
      { id: "sec", pos: [0, 0], kind: "security_entry", airside: false },
      { id: "sec-exit", pos: [0, 1], kind: "security_exit", airside: true },
    ],
    edges: [
      { id: "e1", from: "sec", to: "sec-exit", kind: "security_transition", lengthM: 50, traverseSeconds: 400, bidirectional: false, laneType: "standard" },
    ],
    pois: [{ id: "p1", nodeId: "sec", category: "security", name: "Security", precision: "surveyed" }],
    gateNodeResolver: [],
  };
  const issues = validateAirportLayoutGraph(bad);
  assert.ok(
    issues.some((i) => i.includes("(M32)")),
    `Expected an M32 violation, got:\n  - ${issues.join("\n  - ")}`,
  );
});
