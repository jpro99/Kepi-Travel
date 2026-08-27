import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAirportLayoutPackage } from "../airportLayoutPackage";
import { resolvePublishedAirportLayout } from "../airportLayoutStore";
import { getAirportLayout } from "../getLayout";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import {
  applyFcoKacOverlay,
  curatedFirstMileEdgeSnapshot,
  curatedFirstMilePoiIds,
} from "./applyFcoKacOverlay";
import {
  buildFcoLayoutWithKacOverlay,
  FCO_KAC_COMPILER_JSON,
  ingestFcoKacPackage,
} from "./fcoKacIngest";
import { FCO_LAYOUT } from "../layouts/fco";
import {
  buildArrivalTripJourney,
  layoutSupportsArrivalFirstMile,
  resolveArrivalOriginNode,
} from "../tripJourney";
import { buildArrivalDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";
import { computeRoute } from "../pathfinder";

function loadFixture(): unknown {
  return FCO_KAC_COMPILER_JSON;
}

test("fixtures/kac/fco.json is the canonical KAC compiler payload (no altered coordinates)", () => {
  const raw = loadFixture() as {
    schemaVersion: number;
    iata: string;
    layout: {
      layoutVersion: string;
      nodes: Array<{ id: string; kind: string; pos: [number, number] }>;
      edges: Array<{ id: string; lengthM?: number }>;
      zones: Array<{ id: string }>;
    };
  };

  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.iata, "FCO");
  assert.equal(raw.layout.layoutVersion, "kac-0.1.0-fco-arrivals-stub");
  assert.equal(raw.layout.zones.length, 2);
  assert.equal(raw.layout.nodes.length, 59);
  assert.equal(raw.layout.nodes.filter((n) => n.kind === "gate").length, 56);
  assert.equal(raw.layout.edges.length, 2);
  assert.ok(raw.layout.edges.every((e) => e.lengthM === undefined), "raw fixture edges omit lengthM");

  const leonardo = raw.layout.nodes.find((n) => n.id === "FCO:node:gt:leonardo");
  assert.deepEqual(leonardo?.pos, [12.2518651, 41.7934437]);

  const e12 = raw.layout.nodes.find((n) => n.id === "FCO:node:gate:E12");
  assert.deepEqual(e12?.pos, [12.2481477, 41.7961053]);
});

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
  assert.ok(stats.edgesAdded >= 1);
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
    ["deplane", "passport", "baggage", "customs", "exit", "ground_transport", "ground_transport"],
  );
  assert.equal(stops[0]?.nodeId, "gate-e");
  assert.equal(stops[1]?.poiId, "poi-passport-t3");
  assert.equal(stops[5]?.poiId, "poi-leonardo-express");
  assert.equal(stops[6]?.poiId, "poi-roma-termini");
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

test("getAirportLayout(FCO) returns merged KAC overlay (client-safe, no fs)", () => {
  const layout = getAirportLayout("FCO");
  assert.ok(layout);

  assert.ok(layout!.zones.some((z) => z.id === "FCO:zone:t3"));
  assert.ok(layout!.zones.some((z) => z.id === "FCO:zone:t1"));
  assert.ok(layout!.nodes.some((n) => n.id === "FCO:node:gate:E12"));
  assert.ok(layout!.nodes.filter((n) => n.kind === "gate").length >= 56);
  assert.ok(layout!.nodes.some((n) => n.id === "passport-t3"));
  assert.ok(layout!.nodes.some((n) => n.id === "baggage-t3"));
  assert.ok(layout!.nodes.some((n) => n.id === "customs-t3"));
  assert.ok(layout!.nodes.some((n) => n.id === "ground-leonardo"));

  assert.deepEqual(
    curatedFirstMileEdgeSnapshot(layout!),
    curatedFirstMileEdgeSnapshot(FCO_LAYOUT),
  );
  assert.deepEqual(curatedFirstMilePoiIds(layout!), curatedFirstMilePoiIds(FCO_LAYOUT));
  assert.equal(resolveArrivalOriginNode(layout!, "E12"), "gate-e");
  assert.ok(layoutSupportsArrivalFirstMile(layout!));

  assert.doesNotThrow(() => parseAirportLayoutPackage({
    schemaVersion: 1,
    iata: "FCO",
    revision: 1,
    status: "draft",
    layout: layout!,
    source: {
      ownership: "kepi_original",
      attribution: "test",
      sourceUrls: ["https://www.openstreetmap.org"],
      licenseNote: "test",
      lastVerifiedAt: "2026-08-23",
    },
    precisionGrade: "schematic",
    createdAt: "2026-08-23T23:45:00.000Z",
    updatedAt: "2026-08-23T23:45:00.000Z",
    publishedAt: null,
  }));

  const leonardoEdge = layout!.edges.find((e) => e.to === "FCO:node:gt:leonardo");
  assert.equal(leonardoEdge, undefined, "dropped KAC edge to skipped Leonardo node");
});

test("resolvePublishedAirportLayout(FCO) seeds merged layout without 500-class validation errors", async () => {
  const resolved = await resolvePublishedAirportLayout("FCO");
  assert.ok(resolved.layout);
  assert.equal(resolved.source, "bundled");
  assert.ok(resolved.layout!.zones.some((z) => z.id === "FCO:zone:t3"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "FCO:node:gate:E12"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "passport-t3"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "baggage-t3"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "customs-t3"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "ground-leonardo"));
});

test("merged FCO layout yields walk minutes on passport, bags, and customs coach steps", () => {
  const layout = getAirportLayout("FCO");
  assert.ok(layout);
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    flightNumber: "AS180",
    departureIata: "SEA",
    arrivalGate: "E12",
    flightArrivalTime: "2026-09-02 14:30",
    flightTimezone: "Europe/Rome",
  });
  const passport = steps.find((s) => s.id === "immigration");
  const bags = steps.find((s) => s.id === "bags");
  const customs = steps.find((s) => s.id === "customs");
  assert.ok((passport?.minutes ?? 0) >= 1, "passport walk minutes");
  assert.ok((bags?.minutes ?? 0) >= 1, "baggage walk minutes");
  assert.ok((customs?.minutes ?? 0) >= 1, "customs walk minutes");
});
