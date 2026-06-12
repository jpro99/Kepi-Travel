/**
 * Direct MapTiler loading — style URLs include the key; transformRequest fills it in
 * on tile/glyph/sprite requests that omit it. Avoids /api/maptiles (MapLibre fetches
 * often run without Clerk session cookies).
 */
export function maptilerStyleUrl(stylePath: string, maptilerKey: string): string {
  return `https://api.maptiler.com/maps/${stylePath}/style.json?key=${encodeURIComponent(maptilerKey)}`;
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
