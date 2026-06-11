"use client";

import type { AirportTerminal3DModel, IndoorPositionFix } from "@/lib/airportNav/types";
import { haversineMeters } from "@/lib/airportNav/pathfinder3d";
import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

interface UserLocationLayerProps {
  map: maplibregl.Map;
  mapLib: typeof maplibregl;
  fix: IndoorPositionFix | null;
  model: AirportTerminal3DModel | null;
  airportIata: string;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function buildUserMarkerElement(label: string, atAirport: boolean): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center gap-1 pointer-events-none select-none";
  wrap.innerHTML = `
    <div class="rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/20 whitespace-nowrap">
      ${label}
    </div>
    <div class="relative flex h-10 w-10 items-center justify-center">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full ${atAirport ? "bg-sky-400/40" : "bg-amber-400/35"}"></span>
      <span class="relative inline-flex h-5 w-5 rounded-full border-[3px] border-white ${atAirport ? "bg-sky-500" : "bg-amber-500"} shadow-lg"></span>
    </div>
  `;
  return wrap;
}

export function UserLocationLayer({
  map,
  mapLib,
  fix,
  model,
  airportIata,
}: UserLocationLayerProps) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map || !fix) return undefined;

    const airportCenter = model?.center ?? fix.pos;
    const distM = model
      ? haversineMeters(fix.pos, airportCenter)
      : 0;
    const atAirport = Boolean(fix.snappedNodeId) || distM <= 150;
    const label = atAirport ? "You are here" : `${formatDistance(distM)} from ${airportIata}`;

    if (!markerRef.current) {
      markerRef.current = new mapLib.Marker({
        element: buildUserMarkerElement(label, atAirport),
        anchor: "center",
        className: "airport-nav-user-marker",
      })
        .setLngLat([fix.pos.lng, fix.pos.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([fix.pos.lng, fix.pos.lat]);
      const element = markerRef.current.getElement();
      const labelEl = element?.querySelector("div");
      if (labelEl) labelEl.textContent = label;
    }

    const sourceId = "airport-user-location";
    const accuracyFeature: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [fix.pos.lng, fix.pos.lat],
      },
    };

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(accuracyFeature);
    } else if (map.isStyleLoaded()) {
      map.addSource(sourceId, { type: "geojson", data: accuracyFeature });
      map.addLayer({
        id: "airport-user-accuracy",
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": fix.accuracyM <= 25 ? 14 : fix.accuracyM <= 60 ? 22 : 30,
          "circle-color": atAirport ? "#38bdf8" : "#fbbf24",
          "circle-opacity": 0.15,
          "circle-stroke-width": 1,
          "circle-stroke-color": atAirport ? "#38bdf8" : "#fbbf24",
          "circle-stroke-opacity": 0.35,
        },
      });
    }

    if (!atAirport && model && map.isStyleLoaded()) {
      const linkId = "airport-user-offsite-link";
      const linkFeature: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [fix.pos.lng, fix.pos.lat],
            [airportCenter.lng, airportCenter.lat],
          ],
        },
      };
      const existing = map.getSource(linkId) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(linkFeature);
      } else {
        map.addSource(linkId, { type: "geojson", data: linkFeature });
        map.addLayer({
          id: linkId,
          type: "line",
          source: linkId,
          paint: {
            "line-color": "#fbbf24",
            "line-width": 2,
            "line-opacity": 0.7,
            "line-dasharray": [2, 2],
          },
        });
      }
    } else {
      if (map.getLayer("airport-user-offsite-link")) map.removeLayer("airport-user-offsite-link");
      if (map.getSource("airport-user-offsite-link")) map.removeSource("airport-user-offsite-link");
    }

    return undefined;
  }, [map, mapLib, fix, model, airportIata]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );

  return null;
}

export function describeUserLocation(
  fix: IndoorPositionFix | null,
  model: AirportTerminal3DModel | null,
  airportIata: string,
): string | null {
  if (!fix) return "Locating you…";
  if (!model) return null;
  const distM = haversineMeters(fix.pos, model.center);
  if (fix.snappedNodeId || distM <= 150) {
    return "You are at the terminal (GPS)";
  }
  return `You are ${formatDistance(distM)} from ${airportIata} — routes start at the airport`;
}

export function fitMapToUserAndTerminal(
  map: maplibregl.Map,
  mapLib: typeof maplibregl,
  model: AirportTerminal3DModel,
  fix: IndoorPositionFix,
): void {
  const bounds = new mapLib.LngLatBounds();
  bounds.extend([fix.pos.lng, fix.pos.lat]);
  bounds.extend([model.center.lng, model.center.lat]);
  for (const node of model.graph.nodes) {
    bounds.extend([node.pos.lng, node.pos.lat]);
  }
  const distM = haversineMeters(fix.pos, model.center);
  map.fitBounds(bounds, {
    padding: { top: 120, bottom: 180, left: 48, right: 48 },
    pitch: distM > 2000 ? 0 : 52,
    bearing: -24,
    duration: 800,
    maxZoom: distM > 5000 ? 8 : distM > 1500 ? 10 : 17,
  });
}
