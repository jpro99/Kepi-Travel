/**
 * Direct MapTiler loading — style URLs include the key; transformRequest fills it in
 * on tile/glyph/sprite requests that omit it. Avoids /api/maptiles (MapLibre fetches
 * often run without Clerk session cookies).
 */
export const MAPLIBRE_FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

export type LiveMapStyleId = "dark" | "streets" | "satellite";

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
