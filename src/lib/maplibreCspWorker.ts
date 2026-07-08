"use client";

import maplibregl from "maplibre-gl";

/**
 * MapLibre's UMD bundle sets a `blob:` worker URL as soon as this library loads.
 * That must be overridden on the same tick (before any Map is constructed). Doing
 * this only in `useEffect` is too late — workers may already be tied to the blob.
 */
if (typeof window !== "undefined") {
  try {
    maplibregl.setWorkerUrl(`${window.location.origin}/maplibre-gl-csp-worker.js`);
  } catch (error) {
    console.warn("[maplibre] CSP worker setup failed", error);
  }
}
