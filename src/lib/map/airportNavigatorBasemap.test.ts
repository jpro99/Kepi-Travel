import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIRPORT_NAVIGATOR_PLANET_STYLE_PATH,
  applyAirportNavigatorPlanetBasemap,
  resolveAirportNavigatorBasemapStyleUrl,
} from "./airportNavigatorBasemap";

test("resolveAirportNavigatorBasemapStyleUrl uses Planet streets-v2 never hybrid", () => {
  const url = resolveAirportNavigatorBasemapStyleUrl("test-key");
  assert.match(url, /streets-v2\/style\.json/);
  assert.doesNotMatch(url, /hybrid|satellite/i);
  assert.equal(AIRPORT_NAVIGATOR_PLANET_STYLE_PATH, "streets-v2");
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
    addedLayers.some((entry) => entry.startsWith("kepi-planet-aviation-fill:")),
    "aviation fill layer added",
  );
  assert.ok(
    addedLayers.some((entry) => entry.startsWith("kepi-planet-aviation-line:")),
    "aviation_line layer added",
  );
  assert.ok(!layoutCalls.some((c) => c.id === "building"), "building layers untouched");
});
