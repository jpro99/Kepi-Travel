import assert from "node:assert/strict";
import test from "node:test";
import { projectDeadReckoningOnGraph } from "@/lib/airportNav/pathfinder3d";
import { fuseFix } from "@/lib/airportNav/positionFusion";
import type {
  IndoorPositionFix,
  NavGraphEdge,
  NavGraphNode,
  Point3D,
  WalkwayGraph,
} from "@/lib/airportNav/types";

// A T-shaped corridor near the equator (so 0.001 deg ~= 111 m on both axes and
// bearings are clean): A --north--> B, then B branches north to C and east to D.
//
//        C
//        |
//   D -- B
//        |
//        A
function node(id: string, lng: number, lat: number): NavGraphNode {
  return { id, pos: { lng, lat, level: "concourse" }, kind: "junction" };
}

function edge(id: string, from: string, to: string): NavGraphEdge {
  return {
    id,
    from,
    to,
    kind: "walkway",
    lengthM: 111,
    traverseSeconds: 90,
    bidirectional: true,
    accessible: true,
  };
}

const GRAPH: WalkwayGraph = {
  nodes: [
    node("A", 0, 0),
    node("B", 0, 0.001),
    node("C", 0, 0.002),
    node("D", 0.001, 0.001),
  ],
  edges: [edge("e-ab", "A", "B"), edge("e-bc", "B", "C"), edge("e-bd", "B", "D")],
};

function metersNorth(from: Point3D, meters: number): Point3D {
  return { ...from, lat: from.lat + meters / 111_190 };
}

function metersEast(from: Point3D, meters: number): Point3D {
  return { ...from, lng: from.lng + meters / 111_320 };
}

function drFix(pos: Point3D, atMs: number, snappedNodeId?: string): IndoorPositionFix {
  return {
    pos,
    accuracyM: 40,
    confidence: 0.5,
    source: "dead_reckoning",
    at: new Date(atMs).toISOString(),
    snappedNodeId,
  };
}

const A = GRAPH.nodes[0].pos;
const B = GRAPH.nodes[1].pos;

test("continues along the current edge when displacement fits within it", () => {
  const previous = drFix(A, 0, "A");
  const incoming = drFix(metersNorth(A, 80), 2000);
  const result = projectDeadReckoningOnGraph(GRAPH, previous, incoming);

  assert.equal(result.ambiguous, false);
  // 80 m of a ~111 m edge lands past the midpoint, so it snaps to B.
  assert.equal(result.snappedNodeId, "B");
  assert.ok(result.pos.lat > 0 && result.pos.lat <= 0.001 + 1e-9);
});

test("transitions through a junction onto the connected edge", () => {
  const previous = drFix(A, 0, "A");
  // 140 m north passes B (111 m) and continues ~29 m up the B->C corridor.
  const incoming = drFix(metersNorth(A, 140), 2000);
  const result = projectDeadReckoningOnGraph(GRAPH, previous, incoming);

  assert.equal(result.ambiguous, false);
  assert.ok(result.pos.lat > 0.001, "should have moved north past node B");
  assert.ok(result.advancedMeters > 111, "should have crossed the A->B edge");
});

test("refuses a turn the graph does not offer (off-corridor heading)", () => {
  const previous = drFix(A, 0, "A");
  // Heading due east from A, but A only connects north to B.
  const incoming = drFix(metersEast(A, 60), 2000);
  const result = projectDeadReckoningOnGraph(GRAPH, previous, incoming);

  assert.equal(result.ambiguous, true);
  assert.equal(result.snappedNodeId, "A", "must not walk through a wall");
  assert.ok(Math.abs(result.pos.lat) < 1e-9 && Math.abs(result.pos.lng) < 1e-9);
});

test("refuses to guess between two equally-plausible branches", () => {
  const previous = drFix(B, 0, "B");
  // Heading NE (~45 deg) from the B junction: both B->C (north) and B->D (east)
  // are equally plausible.
  const ne: Point3D = {
    lng: B.lng + 40 / 111_320 / Math.SQRT2,
    lat: B.lat + 40 / 111_190 / Math.SQRT2,
    level: B.level,
  };
  const incoming = drFix(ne, 2000);
  const result = projectDeadReckoningOnGraph(GRAPH, previous, incoming);

  assert.equal(result.ambiguous, true);
});

test("fuseFix re-anchors dead reckoning onto the graph after a trusted fix and never raises confidence", () => {
  const trusted: IndoorPositionFix = {
    pos: A,
    accuracyM: 3,
    confidence: 0.95,
    source: "user_confirmed",
    at: new Date(0).toISOString(),
    snappedNodeId: "A",
  };
  // Raw DR estimate drifts north-east off the corridor; graph should pull it
  // back onto the A->B walkway.
  const incoming = drFix(
    { lng: metersEast(A, 20).lng, lat: metersNorth(A, 80).lat, level: A.level },
    2000,
  );

  const fused = fuseFix(trusted, incoming, GRAPH);

  assert.equal(fused.snappedNodeId, "B", "re-anchored onto the graph corridor");
  assert.ok(fused.confidence <= 0.55, "dead-reckoning ceiling preserved");
  assert.ok(fused.confidence <= trusted.confidence, "confidence never raised");
  assert.ok(
    Math.abs(fused.pos.lng) < 1e-6,
    "position is constrained onto the corridor, not the raw drifted estimate",
  );
});

test("fuseFix lowers confidence more when the graph cannot resolve the move", () => {
  const previous = drFix(A, 0, "A");

  const clean = fuseFix(previous, drFix(metersNorth(A, 60), 2000), GRAPH);
  const ambiguous = fuseFix(previous, drFix(metersEast(A, 60), 2000), GRAPH);

  assert.ok(
    ambiguous.confidence < clean.confidence,
    "ambiguous graph-constrained DR is less confident than a clean continuation",
  );
  assert.ok(
    Math.abs(ambiguous.pos.lng) < 1e-9,
    "ambiguous move stays anchored instead of drifting through a wall",
  );
});
