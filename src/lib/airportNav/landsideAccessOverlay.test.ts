import assert from "node:assert/strict";
import { test } from "node:test";

import { getAirportLayout } from "./getLayout";
import {
  buildLandsideAccessOverlayGeoJson,
  isPackageLandsideAccessZone,
} from "./landsideAccessOverlay";

test("ONT merged layout draws T2 landside access ring + curb frontage from package", () => {
  const layout = getAirportLayout("ONT")!;
  const overlay = buildLandsideAccessOverlayGeoJson(layout);

  assert.ok(
    overlay.accessLoopZones.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "ONT:zone:t2-landside",
    ),
  );
  assert.equal(
    overlay.accessLoopZones.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "ONT:zone:t4-landside",
    ),
    false,
    "T4 landside ring invalid in factory — must stay absent",
  );
  assert.ok(overlay.curbPoints.features.length >= 4);
  assert.ok(
    overlay.accessPaths.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "ONT:edge:landside-frontage-t2-t4",
    ),
  );
});

test("SEA merged layout draws central landside box + curb walk-in from package", () => {
  const layout = getAirportLayout("SEA")!;
  const overlay = buildLandsideAccessOverlayGeoJson(layout);

  assert.ok(
    overlay.accessLoopZones.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "SEA:zone:landside",
    ),
  );
  assert.ok(
    overlay.curbPoints.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "SEA:node:curb:central",
    ),
  );
  assert.ok(
    overlay.accessPaths.features.some(
      (f) => f.properties && (f.properties as { id: string }).id === "SEA:edge:curb-checkin",
    ),
  );
});

test("FCO factory package has no explicit landside access loop zone", () => {
  const layout = getAirportLayout("FCO")!;
  const overlay = buildLandsideAccessOverlayGeoJson(layout);
  assert.equal(overlay.accessLoopZones.features.length, 0);
  assert.ok(
    !layout.zones.some((z) => isPackageLandsideAccessZone(z) && z.id.startsWith("FCO:")),
  );
});
