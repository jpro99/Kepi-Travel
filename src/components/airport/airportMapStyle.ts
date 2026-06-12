import type maplibregl from "maplibre-gl";
import { directMaptilerTransformRequest } from "@/lib/map/maptilerClient";

/** @deprecated Prefer directMaptilerTransformRequest with a key from /api/config */
export function proxyMaptilerRequest(url: string): { url: string } | undefined {
  if (!url.includes("api.maptiler.com")) return undefined;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const clean = url.replace(/[?&]key=[^&]*/g, "").replace(/\?$/, "");
  const tokenMatch = clean.match(/^(.*?)(\{[^}]+\}.*)$/);
  if (tokenMatch) {
    const base = tokenMatch[1].replace(/\/$/, "");
    const suffix = tokenMatch[2];
    return { url: `${origin}/api/maptiles?url=${encodeURIComponent(base)}&suffix=${suffix}` };
  }
  return { url: `${origin}/api/maptiles?url=${encodeURIComponent(clean)}` };
}

/** Basemap + dark fallback — terminal 3D layers are added after load. */
export function buildAirportMapStyle(maptilerKey?: string): maplibregl.StyleSpecification {
  const keySuffix = maptilerKey ? `?key=${encodeURIComponent(maptilerKey)}` : "";
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg${keySuffix}`],
        tileSize: 512,
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0B1F3A" },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: { "raster-opacity": 0.55 },
      },
    ],
  };
}

export { directMaptilerTransformRequest };
