import assert from "node:assert/strict";
import { test } from "node:test";

import { getAirportLayout } from "../getLayout";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyKacOverlay } from "./applyKacOverlay";
import { resolveBookedGateHighlight } from "./bookedGateHighlight";
import {
  buildOntLayoutWithKacOverlay,
  ingestOntKacPackage,
  ONT_KAC_COMPILER_JSON,
} from "./ontKacIngest";
import {
  buildSeaLayoutWithKacOverlay,
  ingestSeaKacPackage,
  SEA_KAC_COMPILER_JSON,
} from "./seaKacIngest";
import { ONT_LAYOUT } from "../layouts/ont";
import { SEA_LAYOUT } from "../layouts/sea";
import { buildTripJourney } from "../tripJourney";
import { resolveGateNode } from "../pathfinder";
import { ontCuratedEdgeSnapshot } from "./ontFirstMileGuards";
import { seaCuratedEdgeSnapshot } from "./seaConnectionGuards";

const ONT_LOUNGE_COORDS: Record<string, [number, number]> = {
  "ONT:lounge:aspire-t2": [-117.59651370303231, 34.060182788605545],
  "ONT:lounge:aspire-t4": [-117.58629674491232, 34.060179575902026],
};

const SEA_LOUNGE_COORDS: Record<string, [number, number]> = {
  "SEA:lounge:alaska-c": [-122.30418036666667, 47.44617026666666],
  "SEA:lounge:alaska-d": [-122.30075778534199, 47.4446159],
  "SEA:lounge:alaska-n": [-122.3035765, 47.44920381666666],
};

test("fixtures/kac/ont.json is kac-1.0.2 with locked lounge coords", () => {
  const raw = ONT_KAC_COMPILER_JSON as unknown as {
    layout: { layoutVersion: string; nodes: Array<{ id: string; pos: [number, number] }> };
  };
  assert.equal(raw.layout.layoutVersion, "kac-1.0.2-ont");
  for (const [id, pos] of Object.entries(ONT_LOUNGE_COORDS)) {
    const node = raw.layout.nodes.find((n) => n.id === id);
    assert.ok(node, `missing ${id}`);
    assert.deepEqual(node!.pos, pos);
  }
  assert.ok(!raw.layout.nodes.some((n) => n.id === "ONT:node:lounge:t2-aspire"));
});

test("fixtures/kac/sea.json is kac-1.0.2 with locked lounge coords", () => {
  const raw = SEA_KAC_COMPILER_JSON as unknown as {
    layout: { layoutVersion: string; nodes: Array<{ id: string; pos: [number, number] }> };
  };
  assert.equal(raw.layout.layoutVersion, "kac-1.0.2-sea");
  for (const [id, pos] of Object.entries(SEA_LOUNGE_COORDS)) {
    const node = raw.layout.nodes.find((n) => n.id === id);
    assert.ok(node, `missing ${id}`);
    assert.deepEqual(node!.pos, pos);
  }
});

test("KAC ONT + SEA fixtures adapt to valid packages", () => {
  const ont = adaptKacCompilerJson(ONT_KAC_COMPILER_JSON);
  const sea = adaptKacCompilerJson(SEA_KAC_COMPILER_JSON);
  assert.equal(ont.iata, "ONT");
  assert.equal(sea.iata, "SEA");
  assert.equal(ont.layout.nodes.filter((n) => n.kind === "gate").length, 26);
  assert.equal(sea.layout.nodes.filter((n) => n.kind === "gate").length, 103);
  assert.ok(ont.layout.edges.every((e) => e.lengthM > 0));
  assert.ok(sea.layout.edges.every((e) => e.lengthM > 0));
});

test("ONT KAC overlay is additive and preserves curated first-mile graph", () => {
  const kac = ingestOntKacPackage();
  const before = ontCuratedEdgeSnapshot(ONT_LAYOUT);
  const { layout, stats } = applyKacOverlay(ONT_LAYOUT, kac.layout, {
    nodeIds: ONT_LAYOUT.nodes.map((n) => n.id),
    edgeIds: ONT_LAYOUT.edges.map((e) => e.id),
    poiIds: ONT_LAYOUT.pois.map((p) => p.id),
  }, {
    mergeGateResolver: true,
    unroutedGatePoiIdPrefix: "poi:ONT:node:gate:",
    areaLoungeNodeIds: ["ONT:lounge:aspire-t2", "ONT:lounge:aspire-t4"],
  });

  assert.ok(stats.zonesAdded >= 1);
  assert.ok(stats.gateNodesAdded >= 20);
  assert.deepEqual(ontCuratedEdgeSnapshot(layout), before);
  assert.ok(layout.nodes.some((n) => n.id === "ONT:node:gate:2-05"));
  assert.ok(layout.nodes.some((n) => n.id === "curb-t2"));
});

test("KAC overlay drops dangling edges when endpoint node is not merged", () => {
  const kac = ingestOntKacPackage();
  const kacWithDangle = {
    ...kac.layout,
    edges: [
      ...kac.layout.edges,
      {
        id: "ONT:edge:dangle-test",
        from: "ONT:node:gate:2-05",
        to: "ONT:node:gt:never-added",
        kind: "walkway" as const,
        lengthM: 50,
        traverseSeconds: 40,
        bidirectional: true,
      },
    ],
  };
  const { layout, stats } = applyKacOverlay(ONT_LAYOUT, kacWithDangle, {
    nodeIds: ONT_LAYOUT.nodes.map((n) => n.id),
    edgeIds: ONT_LAYOUT.edges.map((e) => e.id),
    poiIds: ONT_LAYOUT.pois.map((p) => p.id),
  }, {
    mergeGateResolver: true,
    unroutedGatePoiIdPrefix: "poi:ONT:node:gate:",
    areaLoungeNodeIds: ["ONT:lounge:aspire-t2", "ONT:lounge:aspire-t4"],
  });
  assert.ok(stats.droppedDanglingEdges >= 1);
  assert.equal(layout.edges.find((e) => e.id === "ONT:edge:dangle-test"), undefined);
});

test("SEA KAC overlay preserves curated train connection graph", () => {
  const kac = ingestSeaKacPackage();
  const before = seaCuratedEdgeSnapshot(SEA_LAYOUT);
  const layout = buildSeaLayoutWithKacOverlay();

  assert.deepEqual(seaCuratedEdgeSnapshot(layout), before);
  assert.ok(layout.edges.some((e) => e.kind === "train" && e.from === "train-C"));
  assert.ok(layout.nodes.some((n) => n.id === "SEA:node:gate:C11"));
  const walkMainToN = layout.edges.find(
    (e) =>
      e.kind === "walkway" &&
      ((e.from === "gate-C" && e.to === "gate-N") || (e.from === "gate-N" && e.to === "gate-C")),
  );
  assert.equal(walkMainToN, undefined, "no illegal main↔N walk introduced");
});

test("SEA Alaska lounge AREA dots exist and have no incident edges", () => {
  const layout = buildSeaLayoutWithKacOverlay();
  for (const id of Object.keys(SEA_LOUNGE_COORDS)) {
    const node = layout.nodes.find((n) => n.id === id);
    assert.ok(node, `missing ${id}`);
    assert.equal(node!.kind, "lounge");
    const poi = layout.pois.find((p) => p.nodeId === id);
    assert.ok(poi, `missing poi for ${id}`);
    assert.equal(poi!.category, "amenity", `${id} is schematic AREA dot, not routable lounge`);
    const incident = layout.edges.filter((e) => e.from === id || e.to === id);
    assert.equal(incident.length, 0, `${id} must be unrouted AREA dot`);
  }
});

test("getAirportLayout ONT/SEA return merged KAC overlays", () => {
  const ont = getAirportLayout("ONT");
  const sea = getAirportLayout("SEA");
  assert.ok(ont);
  assert.ok(sea);
  assert.ok(ont!.nodes.some((n) => n.id === "ONT:node:gate:2-05"));
  assert.ok(ont!.nodes.some((n) => n.id === "curb-t2"));
  assert.ok(sea!.nodes.some((n) => n.id === "SEA:node:gate:N15"));
  assert.ok(sea!.nodes.some((n) => n.id === "gate-C"));
});

test("ONT first-mile journey still resolves T2 curb → check-in → security → gate 205", () => {
  const layout = getAirportLayout("ONT")!;
  const stops = buildTripJourney(layout, { airlineName: "Alaska Airlines", gateCode: "205" });
  assert.equal(stops[0]?.nodeId, "curb-t2");
  assert.equal(stops[1]?.nodeId, "checkin-t2");
  assert.equal(stops[3]?.nodeId, "gate-t2");
});

test("booked-gate: known string highlights door node; unknown falls back to airline section", () => {
  const layout = buildOntLayoutWithKacOverlay();
  const exact = resolveBookedGateHighlight(layout, "205", "Alaska Airlines");
  assert.ok(exact);
  assert.equal(exact!.nodeId, "ONT:node:gate:2-05");
  assert.equal(exact!.exactDoor, true);

  const invented = resolveBookedGateHighlight(layout, "999", "Alaska Airlines");
  assert.ok(invented);
  assert.equal(invented!.nodeId, "gate-t2");
  assert.equal(invented!.exactDoor, false);
  assert.equal(resolveGateNode(layout, "999"), null);
});

test("booked-gate: SEA C11 resolves to individual OSM gate node", () => {
  const layout = buildSeaLayoutWithKacOverlay();
  const hit = resolveBookedGateHighlight(layout, "C11", null);
  assert.ok(hit);
  assert.equal(hit!.nodeId, "SEA:node:gate:C11");
  assert.equal(hit!.exactDoor, true);
});
