import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnappedPosition } from "./types";
import {
  UNTRUSTWORTHY_OFF_GRAPH_METERS,
  hasTrustworthyLiveGraphPosition,
  isOffGraphGpsDisplay,
  isTrustworthyGraphSnap,
  needsManualPinBeforeRouting,
  resolveRoutingOriginNodeId,
  resolveTravelerDisplayPosition,
} from "./travelerPosition";

function snap(overrides: Partial<SnappedPosition> = {}): SnappedPosition {
  return {
    pos: [-122.3, 47.45],
    nearestNodeId: "gate-a",
    offGraphMeters: 10,
    confidence: 0.8,
    ...overrides,
  };
}

test("isTrustworthyGraphSnap rejects runway-scale off-graph distance", () => {
  assert.equal(isTrustworthyGraphSnap(snap({ offGraphMeters: 12 }), 20), true);
  assert.equal(
    isTrustworthyGraphSnap(snap({ offGraphMeters: UNTRUSTWORTHY_OFF_GRAPH_METERS + 1 }), 20),
    false,
  );
  assert.equal(isTrustworthyGraphSnap(snap({ offGraphMeters: 30, confidence: 0.4 }), 20), false);
  assert.equal(isTrustworthyGraphSnap(snap({ offGraphMeters: 30 }), 80), false);
});

test("resolveTravelerDisplayPosition prefers raw GPS over misleading snap", () => {
  const raw: [number, number] = [-122.301, 47.449];
  assert.deepEqual(
    resolveTravelerDisplayPosition({
      userLon: raw[0],
      userLat: raw[1],
      snapped: snap({ pos: [-122.29, 47.46], offGraphMeters: 220 }),
      confirmedNodeId: null,
    }),
    raw,
  );
});

test("resolveTravelerDisplayPosition uses confirmed graph node when set", () => {
  const nodePos: [number, number] = [-122.29, 47.46];
  assert.deepEqual(
    resolveTravelerDisplayPosition({
      userLon: -122.301,
      userLat: 47.449,
      snapped: snap({ pos: nodePos }),
      confirmedNodeId: "gate-a",
    }),
    nodePos,
  );
});

test("resolveRoutingOriginNodeId never uses schematic fallback in live mode", () => {
  assert.equal(
    resolveRoutingOriginNodeId({
      previewMode: false,
      confirmedNodeId: null,
      snapped: snap({ offGraphMeters: 180 }),
      schematicFallbackNodeId: "gate-e",
    }),
    null,
  );
  assert.equal(
    resolveRoutingOriginNodeId({
      previewMode: true,
      confirmedNodeId: null,
      snapped: null,
      schematicFallbackNodeId: "gate-e",
    }),
    "gate-e",
  );
  assert.equal(
    resolveRoutingOriginNodeId({
      previewMode: false,
      confirmedNodeId: "door-22",
      snapped: snap({ offGraphMeters: 200 }),
    }),
    "door-22",
  );
});

test("hasTrustworthyLiveGraphPosition and isOffGraphGpsDisplay for apron GPS", () => {
  const runwaySnap = snap({ offGraphMeters: 210, confidence: 0.35 });
  assert.equal(
    hasTrustworthyLiveGraphPosition({
      previewMode: false,
      confirmedNodeId: null,
      snapped: runwaySnap,
      accuracyM: 45,
    }),
    false,
  );
  assert.equal(
    isOffGraphGpsDisplay({
      previewMode: false,
      confirmedNodeId: null,
      userLon: -122.301,
      userLat: 47.449,
      snapped: runwaySnap,
      accuracyM: 45,
    }),
    true,
  );
  assert.equal(
    isOffGraphGpsDisplay({
      previewMode: false,
      confirmedNodeId: "gate-a",
      userLon: -122.301,
      userLat: 47.449,
      snapped: runwaySnap,
      accuracyM: 45,
    }),
    false,
  );
});

test("needsManualPinBeforeRouting when off-graph with no origin", () => {
  assert.equal(
    needsManualPinBeforeRouting({ originNodeId: null, offGraphGps: true, previewMode: false }),
    true,
  );
  assert.equal(
    needsManualPinBeforeRouting({ originNodeId: "gate-a", offGraphGps: true, previewMode: false }),
    false,
  );
  assert.equal(
    needsManualPinBeforeRouting({ originNodeId: null, offGraphGps: true, previewMode: true }),
    false,
  );
});
