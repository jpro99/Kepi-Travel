/**
 * Direct MapTiler loading — style URLs include the key; transformRequest fills it in
 * on tile/glyph/sprite requests that omit it. Avoids /api/maptiles (MapLibre fetches
 * often run without Clerk session cookies).
 */
import type { StyleSpecification } from "maplibre-gl";

export const MAPLIBRE_FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

/** Airport Mode basemap — Planet openstreetmap streets (BRAIN A1). Never hybrid/satellite. */
export const AIRPORT_NAVIGATOR_BASEMAP_STYLE_PATH = "openstreetmap";

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
  if (sourceLayer === "poi_food" || sourceLayer === "poi_shopping") return true;
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
  return maptilerStyleUrl(AIRPORT_NAVIGATOR_BASEMAP_STYLE_PATH, maptilerKey);
}

/**
 * After openstreetmap loads: show Planet aviation polygons/lines, hide food/shop POIs.
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

export type LiveMapStyleId = "dark" | "streets" | "satellite";

/** Inline OSM raster style — works when MapTiler key is missing or CSP blocks demotiles. */
export function buildOsmRasterFallbackStyle(): {
  version: 8;
  sources: Record<string, unknown>;
  layers: Array<Record<string, unknown>>;
} {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "osm-raster",
        type: "raster",
        source: "osm",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

export type LiveMapStyleSpec = string | ReturnType<typeof buildOsmRasterFallbackStyle>;

export function liveMapStylePath(styleId: LiveMapStyleId): string {
  if (styleId === "satellite") return "hybrid";
  if (styleId === "streets") return "streets-v2";
  return "dark-v2";
}

export function maptilerStyleUrl(stylePath: string, maptilerKey: string): string {
  return `https://api.maptiler.com/maps/${stylePath}/style.json?key=${encodeURIComponent(maptilerKey)}`;
}

export function resolveLiveMapStyleUrl(styleId: LiveMapStyleId, maptilerKey?: string): string {
  const key = maptilerKey?.trim();
  if (key) {
    return maptilerStyleUrl(liveMapStylePath(styleId), key);
  }
  return MAPLIBRE_FALLBACK_STYLE_URL;
}

/** Prefer MapTiler when keyed; otherwise use inline OSM tiles (CSP-safe on kepitravel.com). */
export function resolveLiveMapStyle(styleId: LiveMapStyleId, maptilerKey?: string): LiveMapStyleSpec {
  const key = maptilerKey?.trim();
  if (key) {
    return maptilerStyleUrl(liveMapStylePath(styleId), key);
  }
  return buildOsmRasterFallbackStyle();
}

/** Attach once — recover from MapTiler/style URL failures by switching to inline OSM tiles. */
export function attachMapStyleErrorFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  ctx: {
    isCancelled: () => boolean;
    isLoaded: () => boolean;
    markLoaded: () => void;
    usingOsmFallback: { current: boolean };
    onRecovered: () => void;
  },
): void {
  map.on("error", (event: { error?: { message?: string } }) => {
    const message = String(event?.error?.message ?? "Map style failed to load");
    console.warn("[map] style/tile error", message, event);
    if (ctx.isCancelled() || ctx.usingOsmFallback.current) {
      return;
    }
    ctx.usingOsmFallback.current = true;
    map.setStyle(buildOsmRasterFallbackStyle());
    map.once("styledata", () => {
      if (ctx.isCancelled()) return;
      ctx.markLoaded();
      ctx.onRecovered();
    });
  });
}

/** If MapLibre never reaches load (common when MapTiler hangs), force OSM tiles. */
export function scheduleMapLoadFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  ctx: {
    isCancelled: () => boolean;
    isLoaded: () => boolean;
    usingOsmFallback: { current: boolean };
    onReady: () => void;
  },
  delayMs = 4500,
): () => void {
  const timer = window.setTimeout(() => {
    if (ctx.isCancelled() || ctx.isLoaded()) return;
    ctx.usingOsmFallback.current = true;
    map.setStyle(buildOsmRasterFallbackStyle());
    map.once("idle", () => {
      if (ctx.isCancelled()) return;
      ctx.onReady();
    });
  }, delayMs);
  return () => window.clearTimeout(timer);
}

export function directMaptilerTransformRequest(
  maptilerKey: string,
): (url: string) => { url: string } | undefined {
  return (url: string) => {
    if (!url.includes("api.maptiler.com") || url.includes("key=")) {
      return undefined;
    }
    const separator = url.includes("?") ? "&" : "?";
    return { url: `${url}${separator}key=${encodeURIComponent(maptilerKey)}` };
  };
}
