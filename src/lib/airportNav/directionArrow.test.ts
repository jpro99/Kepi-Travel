import assert from "node:assert/strict";
import test from "node:test";
import {
  bearingDegrees,
  computeDirectionArrow,
  confirmedSnappedPosition,
  describeTurnCue,
  nextRouteTarget,
  normalizeSigned,
} from "@/lib/airportNav/directionArrow";
import type { ComputedRoute, GraphNode } from "@/lib/airportNav/types";

// A short due-north route: user at origin, next node straight north.
const NORTH_ROUTE: ComputedRoute = {
  fromNodeId: "a",
  toPoiId: "poi-b",
  nodeIds: ["a", "b", "c"],
  coordinates: [
    [-122.30, 47.4480],
    [-122.30, 47.4490],
    [-122.30, 47.4500],
  ],
  totalMeters: 220,
  totalSeconds: 160,
  instructions: [],
};

test("bearing is ~0 due north and ~90 due east", () => {
  assert.ok(Math.abs(bearingDegrees([-122.3, 47.448], [-122.3, 47.449])) < 1);
  assert.ok(Math.abs(bearingDegrees([-122.3, 47.448], [-122.29, 47.448]) - 90) < 2);
});

test("normalizeSigned wraps into (-180,180]", () => {
  assert.equal(normalizeSigned(0), 0);
  assert.equal(normalizeSigned(190), -170);
  assert.equal(normalizeSigned(-190), 170);
  assert.equal(normalizeSigned(540), 180);
});

test("nextRouteTarget aims at the node after the current one", () => {
  const target = nextRouteTarget(NORTH_ROUTE, "a");
  assert.equal(target?.nodeId, "b");
  const fromUnknown = nextRouteTarget(NORTH_ROUTE, null);
  assert.equal(fromUnknown?.nodeId, "b");
  const atEnd = nextRouteTarget(NORTH_ROUTE, "c");
  assert.equal(atEnd?.nodeId, "c");
});

test("facing north toward a north target = arrow points straight ahead", () => {
  const arrow = computeDirectionArrow({
    userPos: [-122.3, 47.448],
    route: NORTH_ROUTE,
    currentNodeId: "a",
    headingDeg: 0,
  });
  assert.ok(arrow);
  assert.ok(arrow!.headingKnown);
  assert.ok(Math.abs(arrow!.rotationDeg) < 15);
  assert.equal(arrow!.cue, "Straight ahead");
});

test("facing east toward a north target = arrow says turn left", () => {
  const arrow = computeDirectionArrow({
    userPos: [-122.3, 47.448],
    route: NORTH_ROUTE,
    currentNodeId: "a",
    headingDeg: 90, // facing east, target is north → to the left
  });
  assert.ok(arrow);
  // bearing 0, heading 90 → relative -90 → turn left
  assert.ok(arrow!.rotationDeg < -60);
  assert.match(arrow!.cue, /left/i);
});

test("no compass heading falls back to north-up bearing and honest cue", () => {
  const arrow = computeDirectionArrow({
    userPos: [-122.3, 47.448],
    route: NORTH_ROUTE,
    currentNodeId: "a",
    headingDeg: null,
    targetLandmark: "Concourse B",
  });
  assert.ok(arrow);
  assert.equal(arrow!.headingKnown, false);
  assert.ok(Math.abs(arrow!.bearingDeg) < 1);
  assert.match(arrow!.cue, /Concourse B/);
});

test("describeTurnCue covers the turn bands", () => {
  assert.equal(describeTurnCue(0), "Straight ahead");
  assert.equal(describeTurnCue(40), "Bear right");
  assert.equal(describeTurnCue(-90), "Turn left");
  assert.equal(describeTurnCue(150), "Sharp right");
  assert.equal(describeTurnCue(180), "Turn around");
});

test("tap-to-confirm produces a top-confidence snap at the node", () => {
  const node: GraphNode = { id: "gate-b12", pos: [-122.3, 47.45], kind: "gate", airside: true };
  const snap = confirmedSnappedPosition(node);
  assert.equal(snap.nearestNodeId, "gate-b12");
  assert.equal(snap.offGraphMeters, 0);
  assert.ok(snap.confidence >= 0.95);
});
