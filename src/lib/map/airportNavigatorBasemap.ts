/**
 * Airport Mode basemap — MapTiler Planet streets (BRAIN A1 Sunday method 2026-08-30).
 * One style: streets-v2 with aviation + aviation_line visible on a real airfield.
 * Never Hybrid / satellite. Food and shop POIs hidden; buildings stay on.
 */

import type { StyleSpecification } from "maplibre-gl";
import { maptilerStyleUrl } from "./maptilerClient";

/** Planet streets — not openstreetmap raster, not hybrid/satellite. */
export const AIRPORT_NAVIGATOR_PLANET_STYLE_PATH = "streets-v2";

const AVIATION_FILL_COLOR = "#e8e4dc";
const AVIATION_FILL_OPACITY = 0.82;
const AVIATION_LINE_COLOR = "#f8fafc";
const AVIATION_LINE_WIDTH = 2.2;

const FOOD_SHOP_LAYER_RE =
  /poi[_-]?food|food|restaurant|cafe|coffee|shop|grocery|supermarket|bakery|fast[_-]?food/i;

function layerSourceLayer(layer: { "source-layer"?: string }): string {
  return typeof layer["source-layer"] === "string" ? layer["source-layer"] : "";
}

function shouldHideFoodOrShopLayer(layer: { id?: string; "source-layer"?: string }): boolean {
  const id = layer.id ?? "";
  const sourceLayer = layerSourceLayer(layer);
  if (sourceLayer === "poi_food") return true;
  if (sourceLayer === "poi" && FOOD_SHOP_LAYER_RE.test(id)) return true;
  return FOOD_SHOP_LAYER_RE.test(id) && sourceLayer.startsWith("poi");
}

function findPlanetVectorSourceId(style: StyleSpecification): string | null {
  for (const layer of style.layers ?? []) {
    if (!("source" in layer) || !layer.source) continue;
    const source = style.sources?.[layer.source];
    if (source && typeof source === "object" && "type" in source && source.type === "vector") {
      return layer.source;
    }
  }
  return null;
}

function findLabelAnchorLayerId(style: StyleSpecification): string | undefined {
  const layers = style.layers ?? [];
  for (const layer of layers) {
    if (layer.type === "symbol" && layerSourceLayer(layer) === "transportation_name") {
      return layer.id;
    }
  }
  for (const layer of layers) {
    if (layer.type === "symbol") return layer.id;
  }
  return layers[layers.length - 1]?.id;
}

export function resolveAirportNavigatorBasemapStyleUrl(maptilerKey: string): string {
  return maptilerStyleUrl(AIRPORT_NAVIGATOR_PLANET_STYLE_PATH, maptilerKey);
}

/**
 * After streets-v2 loads: show Planet aviation polygons/lines, hide food/shop POIs.
 * Adds aviation layers when the stock style omits them (same vector source).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyAirportNavigatorPlanetBasemap(map: any): void {
  if (!map?.isStyleLoaded?.()) return;
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return;

  let hasAviationFill = false;
  let hasAviationLine = false;

  for (const layer of style.layers) {
    const sourceLayer = layerSourceLayer(layer);
    const id = layer.id ?? "";

    if (shouldHideFoodOrShopLayer(layer)) {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch {
        /* layer may not support visibility */
      }
      continue;
    }

    if (sourceLayer === "aviation" && layer.type === "fill") {
      hasAviationFill = true;
      try {
        map.setLayoutProperty(id, "visibility", "visible");
        map.setPaintProperty(id, "fill-color", AVIATION_FILL_COLOR);
        map.setPaintProperty(id, "fill-opacity", AVIATION_FILL_OPACITY);
      } catch {
        /* best-effort paint */
      }
    }

    if (sourceLayer === "aviation_line" && layer.type === "line") {
      hasAviationLine = true;
      try {
        map.setLayoutProperty(id, "visibility", "visible");
        map.setPaintProperty(id, "line-color", AVIATION_LINE_COLOR);
        map.setPaintProperty(id, "line-width", AVIATION_LINE_WIDTH);
      } catch {
        /* best-effort paint */
      }
    }
  }

  const sourceId = findPlanetVectorSourceId(style);
  if (!sourceId) return;

  const beforeId = findLabelAnchorLayerId(style);

  if (!hasAviationFill && !map.getLayer("kepi-planet-aviation-fill")) {
    try {
      map.addLayer(
        {
          id: "kepi-planet-aviation-fill",
          type: "fill",
          source: sourceId,
          "source-layer": "aviation",
          paint: {
            "fill-color": AVIATION_FILL_COLOR,
            "fill-opacity": AVIATION_FILL_OPACITY,
          },
        },
        beforeId,
      );
    } catch {
      /* source-layer may be unavailable on older tilesets */
    }
  }

  if (!hasAviationLine && !map.getLayer("kepi-planet-aviation-line")) {
    try {
      map.addLayer(
        {
          id: "kepi-planet-aviation-line",
          type: "line",
          source: sourceId,
          "source-layer": "aviation_line",
          paint: {
            "line-color": AVIATION_LINE_COLOR,
            "line-width": AVIATION_LINE_WIDTH,
          },
        },
        beforeId,
      );
    } catch {
      /* source-layer may be unavailable on older tilesets */
    }
  }
}
