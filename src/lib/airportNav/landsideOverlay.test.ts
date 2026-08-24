import assert from "node:assert/strict";
import { test } from "node:test";

import { getAirportLayout } from "./getLayout";
import {
  buildLandsideOverlayGeoJson,
  extractLandsideOverlayGeometry,
  isAccessLoopZone,
} from "./landsideOverlay";
import { BRI_LAYOUT } from "./layouts/bri";
import { buildBriLayoutWithKacOverlay } from "./kac/briKacIngest";

test("BRI KAC package has curb anchor but no OSM access-loop zone", () => {
  const layout = buildBriLayoutWithKacOverlay();
  const overlay = extractLandsideOverlayGeometry(layout);

  assert.ok(overlay.terminalHulls.some((z) => z.id === "BRI:zone:terminal"));
  assert.equal(overlay.accessLoops.length, 0, "kac-0.1.1-bri has no access-loop ring");
  assert.deepEqual(
    overlay.curbNodes.map((n) => n.id),
    ["BRI:node:curb"],
  );

  const geo = buildLandsideOverlayGeoJson(layout);
  assert.equal(geo.accessLoop.features.length, 0);
  assert.ok(geo.curb.features.some((f) => f.properties?.id === "BRI:node:curb"));
  assert.ok(
    geo.terminalHull.features.some((f) => f.properties?.id === "BRI:zone:terminal"),
    "terminal hull polygon must be emitted for MapLibre overlay",
  );
});

test("access-loop zones are detected only by Cartographer id/name convention", () => {
  assert.ok(isAccessLoopZone({
    id: "BRI:zone:access-loop",
    name: "Departures access (OSM)",
    ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
    airside: false,
    heightM: 0,
  }));
  assert.ok(!isAccessLoopZone({
    id: "BRI:zone:terminal",
    name: "Main terminal (OSM way/24995995 hull)",
    ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
    airside: false,
    heightM: 12,
  }));
});

test("getAirportLayout(BRI) exposes landside overlay curb without inventing a loop", () => {
  const layout = getAirportLayout("BRI");
  assert.ok(layout);
  const overlay = extractLandsideOverlayGeometry(layout!);
  assert.equal(overlay.accessLoops.length, 0);
  assert.ok(overlay.curbNodes.some((n) => n.id === "BRI:node:curb"));
  assert.equal(extractLandsideOverlayGeometry(BRI_LAYOUT).accessLoops.length, 0);
});
