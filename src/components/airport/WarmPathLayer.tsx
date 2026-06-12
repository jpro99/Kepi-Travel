"use client";

import type { NavigationPath } from "@/lib/airportNav/types";
import type maplibregl from "maplibre-gl";
import { useEffect } from "react";

interface WarmPathLayerProps {
  map: maplibregl.Map;
  path: NavigationPath | null;
}

function applyWarmPath(map: maplibregl.Map, path: NavigationPath | null): void {
  if (!map.isStyleLoaded()) return;

  const sourceId = "airport-warm-path";
  const layerId = "airport-warm-path-line";

  const coordinates =
    path?.segments.flatMap((segment) => segment.geometry.coordinates) ?? [];

  if (coordinates.length < 2) {
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData({ type: "FeatureCollection", features: [] });
    }
    return;
  }

  const feature: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates,
    },
  };

  const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(feature);
    return;
  }

  map.addSource(sourceId, { type: "geojson", data: feature, lineMetrics: true });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": [
        "interpolate",
        ["linear"],
        ["line-progress"],
        0,
        "#64748b",
        0.45,
        "#fbbf24",
        1,
        "#fef3c7",
      ],
      "line-width": 6,
      "line-opacity": 0.88,
      "line-dasharray": [0.5, 1.5],
    },
  });
}

export function WarmPathLayer({ map, path }: WarmPathLayerProps) {
  useEffect(() => {
    if (!map) return undefined;

    if (map.isStyleLoaded()) {
      applyWarmPath(map, path);
      return undefined;
    }

    const onLoad = () => applyWarmPath(map, path);
    map.once("load", onLoad);
    return () => {
      map.off("load", onLoad);
    };
  }, [map, path]);

  return null;
}
