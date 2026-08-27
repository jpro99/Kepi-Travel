import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isDirectoryClutterPoi,
  shouldRenderWalkMapPin,
  shouldShowLeaderLineLabel,
  type WalkMapPinContext,
} from "./poiMapWalkPolicy";
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
  assert.equal(shouldRenderWalkMapPin(starbucks), false);
});

test("KAC gate reference pins are walk context, not directory clutter", () => {
  const gate: PoiDefinition = {
    id: "SEA:poi:gate:C11",
    nodeId: "SEA:node:gate:C11",
    category: "amenity",
    name: "Gate C11",
    precision: "schematic",
    notes: "Approximate OSM gate door-ref — unrouted reference pin.",
  };
  assert.equal(isDirectoryClutterPoi(gate), false);
  assert.equal(shouldRenderWalkMapPin(gate), true);
  assert.equal(shouldShowLeaderLineLabel(gate, baseCtx()), false);
  assert.equal(shouldShowLeaderLineLabel(gate, baseCtx({ isSelected: true })), true);
});

test("emphatic journey stops get leader-line labels; reference dots do not", () => {
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
  assert.equal(
    shouldShowLeaderLineLabel(security, baseCtx({ isReference: true, isSecurity: true })),
    false,
  );
});
