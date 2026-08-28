import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAirportLayoutPackage } from "../airportLayoutPackage";
import { resolvePublishedAirportLayout } from "../airportLayoutStore";
import { auditLayoutRouting } from "../layoutQuality";
import { getAirportLayout } from "../getLayout";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import {
  applyBriKacOverlay,
  curatedBriEdgeSnapshot,
  curatedBriNodeSnapshot,
  curatedBriPoiIds,
} from "./applyBriKacOverlay";
import {
  buildBriLayoutWithKacOverlay,
  BRI_KAC_COMPILER_JSON,
  ingestBriKacPackage,
} from "./briKacIngest";
import { BRI_LAYOUT } from "../layouts/bri";

function loadFixture(): unknown {
  return BRI_KAC_COMPILER_JSON;
}

test("fixtures/kac/bri.json is the canonical KAC compiler payload (no altered coordinates)", () => {
  const raw = loadFixture() as {
    schemaVersion: number;
    iata: string;
    status: string;
    layout: {
      layoutVersion: string;
      invented: number;
      nodes: Array<{ id: string; kind: string; pos: [number, number] }>;
      edges: Array<{ id: string; kind: string; lengthM?: number }>;
      zones: Array<{ id: string }>;
      gateTextStubs?: string[];
      gateNodeResolver: unknown[];
    };
  };

  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.iata, "BRI");
  assert.equal(raw.status, "draft");
  assert.equal(raw.layout.layoutVersion, "kac-0.1.1-bri");
  assert.equal(raw.layout.invented, 0);
  assert.equal(raw.layout.zones.length, 1);
  assert.equal(raw.layout.nodes.length, 7);
  assert.equal(raw.layout.edges.length, 5);
  assert.equal(raw.layout.edges.filter((e) => e.kind === "walkway").length, 4);
  assert.ok(raw.layout.edges.some((e) => e.id === "BRI:edge:security-lounge" && e.kind === "security_transition"));
  assert.equal(raw.layout.gateNodeResolver.length, 0);
  assert.ok(raw.layout.edges.every((e) => e.lengthM === undefined), "raw fixture edges omit lengthM");

  const curb = raw.layout.nodes.find((n) => n.id === "BRI:node:curb");
  assert.deepEqual(curb?.pos, [16.7641809, 41.1342024]);

  const lounge = raw.layout.nodes.find((n) => n.id === "BRI:lounge:work");
  assert.deepEqual(lounge?.pos, [16.7639265, 41.13454395000001]);

  const checkinAb = raw.layout.nodes.find((n) => n.id === "BRI:node:checkin-ab");
  assert.ok(checkinAb);
  const baggage = raw.layout.nodes.find((n) => n.id === "BRI:node:baggage");
  assert.ok(baggage);

  assert.ok(raw.layout.gateTextStubs?.includes("A1"));
  assert.ok(raw.layout.gateTextStubs?.includes("A11"));
  assert.ok(raw.layout.gateTextStubs?.includes("B4"));
  assert.equal(raw.layout.gateTextStubs?.length, 15);
});

test("KAC BRI fixture adapts to a valid AirportLayoutPackage", () => {
  const pkg = adaptKacCompilerJson(loadFixture());

  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.iata, "BRI");
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.precisionGrade, "schematic");
  assert.equal(pkg.layout.layoutVersion, "kac-0.1.1-bri");

  assert.doesNotThrow(() => parseAirportLayoutPackage(pkg));

  assert.equal(pkg.layout.nodes.length, 7);
  assert.equal(pkg.layout.nodes.filter((n) => n.kind === "gate").length, 0);
  assert.equal(pkg.layout.edges.length, 5);
  assert.ok(pkg.layout.edges.every((e) => e.lengthM > 0));
  assert.ok(pkg.layout.edges.every((e) => e.traverseSeconds > 0));
  assert.equal(typeof pkg.layout.edges[0]?.bidirectional, "boolean");

  assert.ok(pkg.layout.zones.some((z) => z.id === "BRI:zone:terminal"));
  assert.equal(pkg.layout.gateNodeResolver.length, 0);

  const workPoi = pkg.layout.pois.find((p) => p.nodeId === "BRI:lounge:work");
  assert.ok(workPoi);
  assert.match(workPoi!.name, /Work Lounge/i);
  assert.equal(workPoi?.precision, "schematic");
});

test("KAC adapter fills edge lengthM from haversine between node coordinates", () => {
  const pkg = adaptKacCompilerJson(loadFixture());
  const curbToCheckin = pkg.layout.edges.find((e) => e.id === "BRI:edge:curb-checkin-ab");
  assert.ok(curbToCheckin);
  assert.ok(curbToCheckin!.lengthM >= 5);
  assert.ok(curbToCheckin!.traverseSeconds >= 5);
});

test("KAC BRI overlay is additive and preserves curated departures graph", () => {
  const kac = ingestBriKacPackage();
  const beforeEdges = curatedBriEdgeSnapshot(BRI_LAYOUT);
  const beforePois = curatedBriPoiIds(BRI_LAYOUT);
  const beforeNodes = curatedBriNodeSnapshot(BRI_LAYOUT);

  const { layout, stats } = applyBriKacOverlay(BRI_LAYOUT, kac.layout);

  assert.equal(stats.zonesAdded, 1);
  assert.equal(stats.nodesAdded, 7);
  assert.equal(stats.edgesAdded, 7, "5 KAC departures edges + 2 honest curb-main bridges");
  assert.ok(stats.poisAdded >= 6);

  assert.deepEqual(curatedBriEdgeSnapshot(layout), beforeEdges);
  assert.deepEqual(curatedBriPoiIds(layout), beforePois);
  assert.deepEqual(curatedBriNodeSnapshot(layout), beforeNodes);

  assert.ok(layout.zones.some((z) => z.id === "BRI:zone:terminal"));
  assert.ok(layout.zones.some((z) => z.id === "z-main"));
  assert.ok(layout.nodes.some((n) => n.id === "BRI:lounge:work"));
  assert.ok(layout.nodes.some((n) => n.id === "gate-a"));
  assert.ok(layout.nodes.some((n) => n.id === "curb-main"));
});

test("BRI KAC overlay does not add invented A/B gate door pins", () => {
  const layout = buildBriLayoutWithKacOverlay();
  const gateDoors = layout.nodes.filter(
    (n) =>
      n.kind === "gate" ||
      (n.kind === "door" && !n.id.startsWith("BRI:")) ||
      n.id.startsWith("BRI:node:gate:"),
  );
  // Curated cluster gates only — no KAC door pins.
  assert.deepEqual(
    gateDoors.map((n) => n.id).sort(),
    ["gate-a", "gate-b"],
  );
  assert.equal(
    layout.pois.filter((p) => p.category === "gate" && p.id.startsWith("poi:BRI:")).length,
    0,
  );
});

test("BRI KAC overlay drops dangling edges when endpoints are not merged", () => {
  const kac = ingestBriKacPackage();
  const layoutWithSkip = applyBriKacOverlay(BRI_LAYOUT, {
    ...kac.layout,
    edges: [
      ...kac.layout.edges,
      {
        id: "BRI:edge:orphan",
        from: "BRI:node:curb",
        to: "BRI:node:missing",
        kind: "walkway",
        lengthM: 10,
        traverseSeconds: 8,
        bidirectional: true,
      },
    ],
  }).layout;

  assert.equal(layoutWithSkip.edges.find((e) => e.id === "BRI:edge:orphan"), undefined);
  assert.doesNotThrow(() => parseAirportLayoutPackage({
    schemaVersion: 1,
    iata: "BRI",
    revision: 1,
    status: "draft",
    layout: layoutWithSkip,
    source: {
      ownership: "kepi_original",
      attribution: "test",
      sourceUrls: ["https://www.openstreetmap.org"],
      licenseNote: "test",
      lastVerifiedAt: "2026-08-24",
    },
    precisionGrade: "schematic",
    createdAt: "2026-08-24T00:00:00Z",
    updatedAt: "2026-08-24T00:00:00Z",
    publishedAt: null,
  }));
});

test("getAirportLayout(BRI) returns merged KAC overlay (client-safe, no fs)", () => {
  const layout = getAirportLayout("BRI");
  assert.ok(layout);

  assert.ok(layout!.zones.some((z) => z.id === "BRI:zone:terminal"));
  assert.ok(layout!.nodes.some((n) => n.id === "BRI:lounge:work"));
  assert.ok(layout!.nodes.some((n) => n.id === "curb-main"));
  assert.ok(layout!.nodes.some((n) => n.id === "gate-a"));
  assert.ok(layout!.pois.some((p) => p.nodeId === "BRI:lounge:work"));

  assert.deepEqual(curatedBriEdgeSnapshot(layout!), curatedBriEdgeSnapshot(BRI_LAYOUT));
  assert.deepEqual(curatedBriPoiIds(layout!), curatedBriPoiIds(BRI_LAYOUT));
});

test("resolvePublishedAirportLayout(BRI) seeds merged layout without validation errors", async () => {
  const resolved = await resolvePublishedAirportLayout("BRI");
  assert.ok(resolved.layout);
  assert.equal(resolved.source, "bundled");
  assert.ok(resolved.layout!.zones.some((z) => z.id === "BRI:zone:terminal"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "BRI:lounge:work"));
  assert.ok(resolved.layout!.nodes.some((n) => n.id === "curb-main"));
});

test("BRI KAC overlay bridges curb-main into departures subgraph — no unreachable contextual pins", () => {
  const layout = buildBriLayoutWithKacOverlay();
  assert.ok(layout.edges.some((e) => e.id === "BRI:edge:bridge-curb-main"));
  assert.ok(layout.edges.some((e) => e.id === "BRI:edge:curb-terminal"));
  const audit = auditLayoutRouting(layout);
  assert.equal(audit.errors.length, 0, audit.errors.join("\n"));
  assert.equal(audit.warnings.length, 0, audit.warnings.join("\n"));
});
