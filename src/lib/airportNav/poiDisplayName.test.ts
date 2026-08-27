import assert from "node:assert/strict";
import { test } from "node:test";

import { isRawGraphLabel, resolveNodeDisplayName, resolvePoiDisplayName } from "./poiDisplayName";
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

test("resolvePoiDisplayName falls back to role words when landmark missing", () => {
  const poi: PoiDefinition = {
    id: "poi:SEA:node:iaf:customs",
    nodeId: "SEA:node:iaf:customs",
    category: "customs",
    name: "SEA:node:iaf:customs",
    precision: "schematic",
  };
  assert.equal(resolvePoiDisplayName(poi, { nodes: [] }), "Passport control");
});
