import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOsmRasterFallbackStyle,
  resolveLiveMapStyle,
  resolveLiveMapStyleUrl,
} from "@/lib/map/maptilerClient";

test("resolveLiveMapStyle uses inline OSM tiles when MapTiler key is missing", () => {
  const style = resolveLiveMapStyle("streets");
  assert.equal(typeof style, "object");
  assert.equal((style as { version: number }).version, 8);
});

test("resolveLiveMapStyleUrl uses MapTiler when key is present", () => {
  const url = resolveLiveMapStyleUrl("streets", "test-key");
  assert.match(url, /api\.maptiler\.com/);
  assert.match(url, /key=test-key/);
});

test("buildOsmRasterFallbackStyle includes OSM raster tiles", () => {
  const style = buildOsmRasterFallbackStyle();
  const source = style.sources.osm as { tiles?: string[] };
  assert.ok(Array.isArray(source.tiles));
  assert.match(source.tiles?.[0] ?? "", /openstreetmap\.org/);
});
