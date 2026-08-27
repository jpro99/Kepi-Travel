import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isDirectoryClutterPoi,
  isUnroutedGateReferencePoi,
  shouldRenderWalkMapPin,
  shouldShowLeaderLineLabel,
  type WalkMapPinContext,
} from "./poiMapWalkPolicy";
import { resolveLeaderLabelCollisions } from "./poiMapLeaderLine";
import type { PoiDefinition } from "./types";

const baseCtx = (overrides: Partial<WalkMapPinContext> = {}): WalkMapPinContext => ({
  isSelected: false,
  isGateBubble: false,
  isJourney: false,
  isObjective: false,
  matchesAirline: false,
  isCurbDropoff: false,
  isReference: true,
  isSecurity: false,
  ...overrides,
});

test("shop/food OSM directory POIs are clutter — never walk-map pins", () => {
  const starbucks: PoiDefinition = {
    id: "poi-amenity-starbucks-1",
    nodeId: "amenity-starbucks-1",
    category: "amenity",
    name: "Starbucks",
    precision: "surveyed",
    notes: "OSM node/123",
  };
  assert.ok(isDirectoryClutterPoi(starbucks));
  assert.equal(shouldRenderWalkMapPin(starbucks, baseCtx()), false);
});

test("KAC gate reference pins are not directory clutter but do not render unless booked/selected", () => {
  const gate: PoiDefinition = {
    id: "SEA:poi:gate:C11",
    nodeId: "SEA:node:gate:C11",
    category: "amenity",
    name: "Gate C11",
    precision: "schematic",
    notes: "Approximate OSM gate door-ref — unrouted reference pin.",
  };
  assert.ok(isUnroutedGateReferencePoi(gate));
  assert.equal(shouldRenderWalkMapPin(gate, baseCtx()), false);
  assert.equal(shouldRenderWalkMapPin(gate, baseCtx({ isGateBubble: true, isReference: false })), true);
  assert.equal(shouldShowLeaderLineLabel(gate, baseCtx({ isGateBubble: true, isReference: false })), true);
});

test("journey security gets a leader label; idle security does not", () => {
  const security: PoiDefinition = {
    id: "poi-sec3",
    nodeId: "sec3-entry",
    category: "security",
    name: "Checkpoint 3",
    precision: "schematic",
  };
  assert.equal(
    shouldShowLeaderLineLabel(security, baseCtx({ isJourney: true, isReference: false, isSecurity: true })),
    true,
  );
  assert.equal(shouldRenderWalkMapPin(security, baseCtx({ isReference: true, isSecurity: true })), false);
});

test("resolveLeaderLabelCollisions nudges overlapping labels apart", () => {
  const boxes = resolveLeaderLabelCollisions(
    [
      {
        id: "a",
        priority: 90,
        pinX: 100,
        pinY: 100,
        x: 120,
        y: 80,
        width: 80,
        height: 28,
        elbowX: 110,
        elbowY: 95,
      },
      {
        id: "b",
        priority: 80,
        pinX: 105,
        pinY: 102,
        x: 125,
        y: 82,
        width: 80,
        height: 28,
        elbowX: 115,
        elbowY: 97,
      },
    ],
    400,
    400,
  );
  const a = boxes.find((b) => b.id === "a")!;
  const b = boxes.find((box) => box.id === "b")!;
  assert.ok(Math.abs(a.y - b.y) > 8 || Math.abs(a.x - b.x) > 8, "labels should separate");
});
