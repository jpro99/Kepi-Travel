import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseAirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import {
  applyFcoKacOverlay,
  curatedFirstMileEdgeSnapshot,
  curatedFirstMilePoiIds,
} from "./applyFcoKacOverlay";
import { buildFcoLayoutWithKacOverlay, ingestFcoKacPackage } from "./fcoKacIngest";
import { FCO_LAYOUT } from "../layouts/fco";
import {
  buildArrivalTripJourney,
  layoutSupportsArrivalFirstMile,
  resolveArrivalOriginNode,
} from "../tripJourney";
import { computeRoute } from "../pathfinder";

const FIXTURE = join(process.cwd(), "fixtures/kac/fco.json");

function loadFixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown;
}

test("KAC FCO fixture adapts to a valid AirportLayoutPackage", () => {
  const raw = loadFixture();
  const pkg = adaptKacCompilerJson(raw);

  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.iata, "FCO");
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.precisionGrade, "schematic");
  assert.equal(pkg.publishedAt, null);
  assert.equal(pkg.layout.layoutVersion, "kac-0.1.0-fco-arrivals-stub");

  assert.doesNotThrow(() => parseAirportLayoutPackage(pkg));

  assert.equal(pkg.layout.nodes.length, 59);
  assert.equal(pkg.layout.nodes.filter((n) => n.kind === "gate").length, 56);
  assert.equal(pkg.layout.edges.length, 2);
  assert.ok(pkg.layout.edges.every((e) => e.lengthM > 0));
  assert.ok(pkg.layout.edges.every((e) => e.traverseSeconds > 0));
  assert.equal(typeof pkg.layout.edges[0]?.bidirectional, "boolean");

  assert.equal(pkg.layout.zones.length, 2);
  assert.ok(pkg.layout.zones.some((z) => z.id === "FCO:zone:t3"));
  assert.ok(pkg.layout.zones.some((z) => z.id === "FCO:zone:t1"));

  const stripped = pkg.layout.nodes.find((n) => n.id === "FCO:node:gate:E12");
  assert.ok(stripped);
  assert.equal((stripped as { name?: string }).name, undefined);
  assert.equal((stripped as { doorLabel?: string }).doorLabel, undefined);

  const e12Poi = pkg.layout.pois.find((p) => p.nodeId === "FCO:node:gate:E12");
  assert.ok(e12Poi);
  assert.equal(e12Poi?.doorLabel, "E12");
  assert.equal(e12Poi?.precision, "schematic");
});

test("KAC adapter fills edge lengthM from haversine between node coordinates", () => {
  const pkg = adaptKacCompilerJson(loadFixture());
  const bagToExit = pkg.layout.edges.find((e) => e.id === "FCO:edge:t3-bag-to-exit");
  assert.ok(bagToExit);
  assert.ok(bagToExit!.lengthM >= 5);
  assert.ok(bagToExit!.traverseSeconds >= 5);
});

test("KAC FCO overlay is additive and preserves curated first-mile graph", () => {
  const kac = ingestFcoKacPackage();
  const beforeEdges = curatedFirstMileEdgeSnapshot(FCO_LAYOUT);
  const beforePois = curatedFirstMilePoiIds(FCO_LAYOUT);

  const { layout, stats } = applyFcoKacOverlay(FCO_LAYOUT, kac.layout);

  assert.ok(stats.zonesAdded >= 2);
  assert.ok(stats.gateNodesAdded >= 50);
  assert.ok(stats.edgesAdded >= 2);
  assert.deepEqual(curatedFirstMileEdgeSnapshot(layout), beforeEdges);
  assert.deepEqual(curatedFirstMilePoiIds(layout), beforePois);

  assert.ok(layout.zones.some((z) => z.id === "FCO:zone:t3"));
  assert.ok(layout.zones.some((z) => z.id === "z-t3"));
  assert.ok(layout.nodes.some((n) => n.id === "FCO:node:gate:E12"));
  assert.ok(layout.nodes.some((n) => n.id === "passport-t3"));
  assert.equal(stats.skippedDuplicateGroundTransport, 1);
});

test("FCO layout with KAC overlay still supports arrival first mile", () => {
  const layout = buildFcoLayoutWithKacOverlay();
  assert.ok(layoutSupportsArrivalFirstMile(layout));

  const stops = buildArrivalTripJourney(layout, { gateCode: "E12" });
  assert.deepEqual(
    stops.map((s) => s.role),
    ["deplane", "passport", "baggage", "customs", "exit", "ground_transport"],
  );
  assert.equal(stops[0]?.nodeId, "gate-e");
  assert.equal(stops[1]?.poiId, "poi-passport-t3");
  assert.equal(stops[5]?.poiId, "poi-leonardo-express");
  assert.equal(resolveArrivalOriginNode(layout, null), "gate-e");
});

test("FCO KAC overlay does not add invented A↔E or Schengen walkway edges", () => {
  const layout = buildFcoLayoutWithKacOverlay();
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const gateToGate = layout.edges.filter((e) => {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    return from?.kind === "gate" && to?.kind === "gate";
  });
  assert.equal(gateToGate.length, 0, "no gate-to-gate invented walks");
});

test("FCO gate-e to Leonardo route remains computable after KAC overlay", () => {
  const layout = buildFcoLayoutWithKacOverlay();
  const route = computeRoute({
    layout,
    fromNodeId: "gate-e",
    toPoiId: "poi-leonardo-express",
    credentials: { tsaPreCheck: false, clear: false, known: true },
  });
  assert.ok(route);
  assert.ok(route!.totalSeconds > 0);
});
