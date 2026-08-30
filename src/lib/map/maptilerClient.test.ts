import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRPORT_NAVIGATOR_BASEMAP_STYLE_PATH,
  applyAirportNavigatorPlanetBasemap,
  buildOsmRasterFallbackStyle,
  resolveAirportNavigatorBasemapStyleUrl,
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

test("resolveAirportNavigatorBasemapStyleUrl uses openstreetmap never hybrid", () => {
  const url = resolveAirportNavigatorBasemapStyleUrl("test-key");
  assert.match(url, /openstreetmap\/style\.json/);
  assert.doesNotMatch(url, /hybrid|satellite/i);
  assert.equal(AIRPORT_NAVIGATOR_BASEMAP_STYLE_PATH, "openstreetmap");
});

test("applyAirportNavigatorPlanetBasemap shows aviation and hides food POIs", () => {
  const layoutCalls: Array<{ id: string; prop: string; value: unknown }> = [];
  const addedLayers: string[] = [];

  const style = {
    version: 8,
    sources: {
      maptiler_planet: { type: "vector", url: "https://api.maptiler.com/tiles/v3/tiles.json" },
    },
    layers: [
      { id: "building", type: "fill", source: "maptiler_planet", "source-layer": "building" },
      { id: "Food", type: "symbol", source: "maptiler_planet", "source-layer": "poi" },
      { id: "poi_food", type: "symbol", source: "maptiler_planet", "source-layer": "poi_food" },
      { id: "poi_shopping", type: "symbol", source: "maptiler_planet", "source-layer": "poi_shopping" },
      { id: "Road labels", type: "symbol", source: "maptiler_planet", "source-layer": "transportation_name" },
    ],
  };

  const map = {
    isStyleLoaded: () => true,
    getStyle: () => style,
    getLayer: (id: string) =>
      id.startsWith("kepi-planet") ? undefined : style.layers.find((l) => l.id === id),
    setLayoutProperty: (id: string, prop: string, value: unknown) => {
      layoutCalls.push({ id, prop, value });
    },
    setPaintProperty: () => {},
    addLayer: (layer: { id: string }, beforeId?: string) => {
      addedLayers.push(`${layer.id}:${beforeId ?? ""}`);
    },
  };

  applyAirportNavigatorPlanetBasemap(map);

  assert.ok(
    layoutCalls.some((c) => c.id === "Food" && c.prop === "visibility" && c.value === "none"),
    "food POI layer hidden",
  );
  assert.ok(
    layoutCalls.some((c) => c.id === "poi_food" && c.prop === "visibility" && c.value === "none"),
    "poi_food layer hidden",
  );
  assert.ok(
    layoutCalls.some((c) => c.id === "poi_shopping" && c.prop === "visibility" && c.value === "none"),
    "poi_shopping layer hidden",
  );
  assert.ok(
    addedLayers.some((entry) => entry.startsWith("kepi-planet-aviation-fill:")),
    "aviation fill layer added",
  );
  assert.ok(
    addedLayers.some((entry) => entry.startsWith("kepi-planet-aviation-line:")),
    "aviation_line layer added",
  );
  assert.ok(!layoutCalls.some((c) => c.id === "building"), "building layers untouched");
});
