/**
 * Direct MapTiler loading — style URLs include the key; transformRequest fills it in
 * on tile/glyph/sprite requests that omit it. Avoids /api/maptiles (MapLibre fetches
 * often run without Clerk session cookies).
 */
export const MAPLIBRE_FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

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
    if (ctx.isCancelled() || ctx.isLoaded() || ctx.usingOsmFallback.current) {
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
