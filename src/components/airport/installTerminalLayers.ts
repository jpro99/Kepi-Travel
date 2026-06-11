import type { AirportTerminal3DModel } from "@/lib/airportNav/types";
import type maplibregl from "maplibre-gl";

const TERMINAL_LAYER_IDS = [
  "terminal-L0-fill",
  "terminal-L0-extrusion",
  "terminal-L0-roof",
  "terminal-L1-fill",
  "terminal-L1-extrusion",
  "terminal-L1-roof",
  "airport-walkways-line",
  "airport-walkways-glow",
  "airport-node-pillars",
] as const;

export function installTerminalLayers(map: maplibregl.Map, model: AirportTerminal3DModel): void {
  if (!map.isStyleLoaded()) return;

  for (const level of model.levels) {
    const sourceId = `terminal-${level.id}`;
    const base = level.ordinal * 20;
    const height = (level.extrusionHeight ?? 28) + level.ordinal * 16;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: level.footprint });
    }

    const fillId = `${sourceId}-fill`;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": level.airside === "airside" ? "#475569" : "#334155",
          "fill-opacity": 0.95,
          "fill-outline-color": "#f1f5f9",
        },
      });
    }

    const extrusionId = `${sourceId}-extrusion`;
    if (!map.getLayer(extrusionId)) {
      map.addLayer({
        id: extrusionId,
        type: "fill-extrusion",
        source: sourceId,
        paint: {
          "fill-extrusion-color": level.airside === "airside" ? "#94a3b8" : "#64748b",
          "fill-extrusion-base": base,
          "fill-extrusion-height": base + height,
          "fill-extrusion-opacity": level.airside === "airside" ? 0.92 : 0.85,
          "fill-extrusion-vertical-gradient": true,
        },
      });
    }

    const roofId = `${sourceId}-roof`;
    if (!map.getLayer(roofId)) {
      map.addLayer({
        id: roofId,
        type: "fill-extrusion",
        source: sourceId,
        paint: {
          "fill-extrusion-color": level.airside === "airside" ? "#cbd5e1" : "#94a3b8",
          "fill-extrusion-base": base + height - 1,
          "fill-extrusion-height": base + height + 2,
          "fill-extrusion-opacity": 0.95,
        },
      });
    }
  }

  const walkwayFeatures = model.graph.edges.flatMap((edge) => {
    const from = model.graph.nodes.find((node) => node.id === edge.from);
    const to = model.graph.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return [];
    return [{
      type: "Feature" as const,
      properties: { edgeId: edge.id },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [from.pos.lng, from.pos.lat],
          [to.pos.lng, to.pos.lat],
        ],
      },
    }];
  });

  if (!map.getSource("airport-walkways")) {
    map.addSource("airport-walkways", {
      type: "geojson",
      data: { type: "FeatureCollection", features: walkwayFeatures },
    });
  }

  if (!map.getLayer("airport-walkways-glow")) {
    map.addLayer({
      id: "airport-walkways-glow",
      type: "line",
      source: "airport-walkways",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 10,
        "line-opacity": 0.25,
        "line-blur": 2,
      },
    });
  }

  if (!map.getLayer("airport-walkways-line")) {
    map.addLayer({
      id: "airport-walkways-line",
      type: "line",
      source: "airport-walkways",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }

  const pillarFeatures = model.graph.nodes.map((node) => ({
    type: "Feature" as const,
    properties: { kind: node.kind },
    geometry: {
      type: "Point" as const,
      coordinates: [node.pos.lng, node.pos.lat],
    },
  }));

  if (!map.getSource("airport-node-pillars")) {
    map.addSource("airport-node-pillars", {
      type: "geojson",
      data: { type: "FeatureCollection", features: pillarFeatures },
    });
  }

  if (!map.getLayer("airport-node-pillars")) {
    map.addLayer({
      id: "airport-node-pillars",
      type: "circle",
      source: "airport-node-pillars",
      paint: {
        "circle-radius": 7,
        "circle-color": "#fbbf24",
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export function fitMapToTerminal(
  map: maplibregl.Map,
  mapLib: typeof maplibregl,
  model: AirportTerminal3DModel,
): void {
  const bounds = new mapLib.LngLatBounds();
  for (const node of model.graph.nodes) {
    bounds.extend([node.pos.lng, node.pos.lat]);
  }
  for (const feature of model.levels.flatMap((level) => level.footprint.features)) {
    if (feature.geometry.type === "Polygon") {
      for (const ring of feature.geometry.coordinates) {
        for (const coord of ring) {
          bounds.extend(coord as [number, number]);
        }
      }
    }
  }

  map.fitBounds(bounds, {
    padding: { top: 120, bottom: 180, left: 48, right: 48 },
    pitch: 58,
    bearing: -24,
    duration: 0,
    maxZoom: 17.2,
  });

  map.setMaxBounds(
    new mapLib.LngLatBounds(
      [bounds.getWest() - 0.004, bounds.getSouth() - 0.004],
      [bounds.getEast() + 0.004, bounds.getNorth() + 0.004],
    ),
  );
}

export function configureMapLighting(map: maplibregl.Map): void {
  map.setLight({
    anchor: "viewport",
    color: "#ffffff",
    intensity: 0.45,
    position: [1.5, 210, 60],
  });
}

export function countTerminalLayers(map: maplibregl.Map): number {
  return TERMINAL_LAYER_IDS.filter((id) => map.getLayer(id)).length;
}
