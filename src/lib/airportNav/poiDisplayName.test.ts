import assert from "node:assert/strict";
import { test } from "node:test";

import { isRawGraphLabel, normalizeTravelerFacingLabels, resolveNodeDisplayName, resolvePoiDisplayName } from "./poiDisplayName";
import type { GraphNode, PoiDefinition } from "./types";

test("isRawGraphLabel flags internal ids Walker saw on SEA", () => {
  assert.ok(isRawGraphLabel("SEA:node:curb:central"));
  assert.ok(isRawGraphLabel("SEA:node:bag:domestic"));
  assert.ok(isRawGraphLabel("SEA:node:iaf:customs"));
  assert.ok(isRawGraphLabel("poi:SEA:node:bag:domestic"));
  assert.ok(isRawGraphLabel("bag:domestic"));
  assert.ok(isRawGraphLabel("iaf:customs"));
});

test("isRawGraphLabel allows human names", () => {
  assert.ok(!isRawGraphLabel("Domestic baggage claim"));
  assert.ok(!isRawGraphLabel("Central curb"));
  assert.ok(!isRawGraphLabel("Gate C11"));
  assert.ok(!isRawGraphLabel("Leonardo Express → Roma Termini"));
});

test("resolvePoiDisplayName maps leaked SEA ids to human labels", () => {
  const layout = {
    nodes: [
      {
        id: "SEA:node:curb:central",
        pos: [0, 0] as [number, number],
        kind: "junction" as const,
        airside: false,
        landmark: "Departures curb (schematic)",
      },
      {
        id: "SEA:node:bag:domestic",
        pos: [0, 0] as [number, number],
        kind: "baggage_claim" as const,
        airside: false,
        landmark: "Domestic baggage claim",
      },
      {
        id: "SEA:node:iaf:customs",
        pos: [0, 0] as [number, number],
        kind: "customs" as const,
        airside: false,
        landmark: "IAF passport control",
      },
    ] satisfies GraphNode[],
  };

  const cases: Array<{ poi: PoiDefinition; expected: string }> = [
    {
      poi: {
        id: "poi:SEA:node:curb:central",
        nodeId: "SEA:node:curb:central",
        category: "amenity",
        name: "SEA:node:curb:central",
        precision: "schematic",
      },
      expected: "Departures curb (schematic)",
    },
    {
      poi: {
        id: "poi:SEA:node:bag:domestic",
        nodeId: "SEA:node:bag:domestic",
        category: "baggage",
        name: "SEA:node:bag:domestic",
        precision: "schematic",
      },
      expected: "Domestic baggage claim",
    },
    {
      poi: {
        id: "poi:SEA:node:iaf:customs",
        nodeId: "SEA:node:iaf:customs",
        category: "customs",
        name: "SEA:node:iaf:customs",
        precision: "schematic",
      },
      expected: "IAF passport control",
    },
  ];

  for (const { poi, expected } of cases) {
    assert.equal(resolvePoiDisplayName(poi, layout), expected);
    assert.ok(!isRawGraphLabel(resolvePoiDisplayName(poi, layout)));
  }
});

test("resolvePoiDisplayName includes desk number for numbered check-in counters", () => {
  assert.equal(
    resolvePoiDisplayName(
      {
        id: "poi-checkin-t3-desk-410",
        nodeId: "checkin-t3-desk-410",
        category: "checkin",
        name: "United check-in",
        doorLabel: "410",
      },
      { nodes: [] },
    ),
    "United check-in · Desk 410",
  );
});

test("resolveNodeDisplayName never returns raw graph ids", () => {
  const node: GraphNode = {
    id: "SEA:node:bag:domestic",
    pos: [0, 0],
    kind: "baggage_claim",
    airside: false,
    landmark: "Domestic baggage claim",
  };
  assert.equal(resolveNodeDisplayName(node), "Domestic baggage claim");
});

test("normalizeTravelerFacingLabels repairs cached Redis/IndexedDB layouts with raw ids", () => {
  const badLayout = {
    iata: "SEA",
    name: "SEA",
    layoutVersion: "old",
    updatedAt: "2026-08-27",
    center: [-122.3018, 47.4434] as [number, number],
    zones: [],
    nodes: [
      {
        id: "SEA:node:hub:C",
        pos: [-122.3038079, 47.4455391] as [number, number],
        kind: "junction" as const,
        airside: true,
      },
      {
        id: "SEA:node:train:D",
        pos: [-122.301144, 47.4449672] as [number, number],
        kind: "train_platform" as const,
        airside: true,
      },
      {
        id: "SEA:node:curb:central",
        pos: [-122.2975388, 47.4425006] as [number, number],
        kind: "junction" as const,
        airside: false,
      },
    ],
    edges: [],
    pois: [
      {
        id: "poi:SEA:node:hub:C",
        nodeId: "SEA:node:hub:C",
        category: "amenity" as const,
        name: "SEA:node:hub:C",
        precision: "schematic" as const,
      },
      {
        id: "poi:SEA:node:bag:domestic",
        nodeId: "SEA:node:bag:domestic",
        category: "baggage" as const,
        name: "SEA:node:bag:domestic",
        precision: "schematic" as const,
      },
    ],
    gateNodeResolver: [],
    routeGrade: "schematic" as const,
  };

  const fixed = normalizeTravelerFacingLabels(badLayout);
  assert.equal(fixed.pois.find((p) => p.nodeId === "SEA:node:hub:C")?.name, "Concourse C cluster");
  assert.equal(fixed.pois.find((p) => p.nodeId === "SEA:node:bag:domestic")?.name, "Domestic baggage claim");
  assert.ok(!fixed.pois.some((p) => isRawGraphLabel(p.name)));
});

test("resolvePoiDisplayName falls back to role words when landmark missing", () => {
  const customsPoi: PoiDefinition = {
    id: "poi:SEA:node:iaf:customs",
    nodeId: "SEA:node:iaf:customs",
    category: "customs",
    name: "SEA:node:iaf:customs",
    precision: "schematic",
  };
  assert.equal(
    resolvePoiDisplayName(customsPoi, { nodes: [] }),
    "International arrivals — passport",
  );

  const genericPoi: PoiDefinition = {
    id: "poi:customs-unknown",
    nodeId: "customs-unknown",
    category: "customs",
    name: "customs-unknown",
    precision: "schematic",
  };
  assert.equal(resolvePoiDisplayName(genericPoi, { nodes: [] }), "Customs");
});
