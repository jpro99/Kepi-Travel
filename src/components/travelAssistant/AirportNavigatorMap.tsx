"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirportLayout, ComputedRoute, PoiDefinition, SnappedPosition, TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { computeRoute, resolveGateNode, snapToGraph } from "@/lib/airportNav/pathfinder";

/* ─────────────────────────────────────────────────────────────────────────
 * Kepi Airport Navigator — Phase 0 map surface (spec §B/§C/§D).
 * Schematic 3D terminal rendered on a dark concierge canvas (no basemap —
 * no MapTiler dependency, works offline once the layout is cached).
 * Positions are SNAPPED to the walkway graph and rendered with a confidence
 * halo. Honesty rule: never imply indoor-GPS precision we don't have.
 * ──────────────────────────────────────────────────────────────────────── */

interface AirportNavigatorMapProps {
  iata: string;
  /** e.g. "C11" — from the active flight reservation, may be unknown. */
  gateCode: string | null;
  airlineName: string | null;
  minutesToDeparture: number;
  userLat: number | null;
  userLon: number | null;
  credentials: TravelerSecurityCredentials;
  onCredentialsAnswer: (creds: { tsaPreCheck: boolean; clear: boolean }) => void;
}

const COLOR = {
  canvas: "#0b1f3a",
  landside: "#27405f",
  airside: "#1d3557",
};

const PATH_DIM = "#3b4f6b";
const PATH_WARM = "#f4c95d";
const PATH_WARM_BRIGHT = "#ffe29a";

const POI_ICON: Record<PoiDefinition["category"], string> = {
  gate: "🛫",
  checkin: "🧳",
  security: "🛡",
  lounge: "🛋",
  restroom: "🚻",
  train: "🚈",
  baggage: "🎒",
};

function isAirsidePoi(poi: PoiDefinition): boolean {
  return poi.category !== "checkin";
}

function fmtMins(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

export function AirportNavigatorMap({
  iata,
  gateCode,
  airlineName,
  minutesToDeparture,
  userLat,
  userLon,
  credentials,
  onCredentialsAnswer,
}: AirportNavigatorMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poiMarkersRef = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);

  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ComputedRoute | null>(null);
  const [activeDestName, setActiveDestName] = useState<string | null>(null);
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null); // waiting on credential answer
  const [showInstructions, setShowInstructions] = useState(false);

  // ── Load curated layout ──
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setLayoutError(false);
    void fetch(`/api/airport-nav/${encodeURIComponent(iata)}/layout`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: AirportLayout) => {
        if (!cancelled) setLayout(data);
      })
      .catch(() => {
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [iata]);

  // ── Snapped traveler position (graph-anchored, confidence-scored) ──
  const snapped: SnappedPosition | null = useMemo(() => {
    if (!layout || userLat === null || userLon === null) return null;
    return snapToGraph(layout, userLon, userLat);
  }, [layout, userLat, userLon]);

  // Default route origin: snapped node, else landside hall (sensible pre-trip preview)
  const originNodeId = useMemo(() => {
    if (snapped) return snapped.nearestNodeId;
    if (!layout) return null;
    return layout.nodes.find((node) => node.kind === "junction" && node.id.includes("landside"))?.id
      ?? layout.nodes[0]?.id
      ?? null;
  }, [snapped, layout]);

  const gatePoi: PoiDefinition | null = useMemo(() => {
    if (!layout || !gateCode) return null;
    const gateNodeId = resolveGateNode(layout, gateCode);
    if (!gateNodeId) return null;
    return layout.pois.find((poi) => poi.category === "gate" && poi.nodeId === gateNodeId) ?? null;
  }, [layout, gateCode]);

  // ── Routing ──
  const startRoute = useCallback(
    (poiId: string) => {
      if (!layout || !originNodeId) return;
      const targetPoi = layout.pois.find((poi) => poi.id === poiId);
      if (!targetPoi) return;
      // Ask the security question once before any airside route (spec §B Flow 2)
      if (isAirsidePoi(targetPoi) && !credentials.known) {
        setPendingPoiId(poiId);
        return;
      }
      const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: poiId, credentials });
      setActiveRoute(route);
      setActiveDestName(route ? targetPoi.name : null);
      setShowInstructions(false);
    },
    [layout, originNodeId, credentials],
  );

  const answerCredentials = useCallback(
    (tsaPreCheck: boolean, clear: boolean) => {
      onCredentialsAnswer({ tsaPreCheck, clear });
      // Route continues via the credentials-change effect below.
    },
    [onCredentialsAnswer],
  );

  // When credentials become known and a destination is pending, route to it.
  useEffect(() => {
    if (!credentials.known || !pendingPoiId || !layout || !originNodeId) return;
    const targetPoi = layout.pois.find((poi) => poi.id === pendingPoiId);
    setPendingPoiId(null);
    if (!targetPoi) return;
    const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: targetPoi.id, credentials });
    setActiveRoute(route);
    setActiveDestName(route ? targetPoi.name : null);
  }, [credentials, pendingPoiId, layout, originNodeId]);

  // Re-route from new position as the traveler moves (origin changed nodes)
  useEffect(() => {
    if (!activeRoute || !layout || !originNodeId) return;
    if (activeRoute.fromNodeId === originNodeId) return;
    const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: activeRoute.toPoiId, credentials });
    if (route) setActiveRoute(route);
  }, [originNodeId, activeRoute, layout, credentials]);

  // ── Map init (dark schematic canvas, no remote style) ──
  useEffect(() => {
    if (!mapEl.current || mapRef.current || !layout) return;
    let disposed = false;
    void import("maplibre-gl").then((ml) => {
      if (disposed || !mapEl.current || mapRef.current) return;
      const map = new ml.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": COLOR.canvas } }],
        },
        center: layout.center,
        zoom: 15.2,
        pitch: 58,
        bearing: -15,
        attributionControl: false,
        dragRotate: true,
      });
      mapRef.current = map;
      map.on("load", () => {
        if (disposed) return;
        addLayoutLayers(map, layout);
        setMapReady(true);
      });
    });
    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      poiMarkersRef.current = {};
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, [layout]);

  // ── Layout layers (zones extrusion + faint walkway guides + route) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addLayoutLayers(map: any, lay: AirportLayout) {
    const zoneFeatures = lay.zones.map((zone) => ({
      type: "Feature" as const,
      properties: { height: zone.heightM, airside: zone.airside ? 1 : 0, name: zone.name },
      geometry: { type: "Polygon" as const, coordinates: [zone.ring] },
    }));
    map.addSource("kepi-zones", { type: "geojson", data: { type: "FeatureCollection", features: zoneFeatures } });
    map.addLayer({
      id: "kepi-zones-3d",
      type: "fill-extrusion",
      source: "kepi-zones",
      paint: {
        "fill-extrusion-color": ["case", ["==", ["get", "airside"], 1], COLOR.airside, COLOR.landside],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-opacity": 0.85,
      },
    });

    const nodePos = new Map(lay.nodes.map((node) => [node.id, node.pos]));
    const walkFeatures = lay.edges
      .filter((edge) => edge.kind !== "security_transition")
      .map((edge) => ({
        type: "Feature" as const,
        properties: { train: edge.kind === "train" ? 1 : 0 },
        geometry: {
          type: "LineString" as const,
          coordinates: [nodePos.get(edge.from) ?? [0, 0], nodePos.get(edge.to) ?? [0, 0]],
        },
      }));
    map.addSource("kepi-walkways", { type: "geojson", data: { type: "FeatureCollection", features: walkFeatures } });
    map.addLayer({
      id: "kepi-walkways-line",
      type: "line",
      source: "kepi-walkways",
      paint: {
        "line-color": ["case", ["==", ["get", "train"], 1], "#5a7ba6", "#33507a"],
        "line-width": 2,
        "line-opacity": 0.55,
        "line-dasharray": [1, 2],
      },
    });

    map.addSource("kepi-route", {
      type: "geojson",
      lineMetrics: true,
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "kepi-route-line",
      type: "line",
      source: "kepi-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": 6,
        "line-opacity": 0.95,
        "line-gradient": [
          "interpolate", ["linear"], ["line-progress"],
          0, PATH_WARM,
          1, PATH_WARM_BRIGHT,
        ],
      },
    });
  }

  // ── Push route geometry + warmth gradient ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("kepi-route");
    if (!source) return;
    if (!activeRoute) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: activeRoute.coordinates },
    });

    // Progress = how far along the route the snapped position is (by nearest vertex)
    let progress = 0;
    if (snapped) {
      const idx = activeRoute.nodeIds.indexOf(snapped.nearestNodeId);
      if (idx > 0) progress = idx / Math.max(1, activeRoute.nodeIds.length - 1);
    }
    const fadeStart = Math.min(0.96, Math.max(0.001, progress));
    const fadeEnd = Math.min(0.98, fadeStart + 0.02);
    map.setPaintProperty("kepi-route-line", "line-gradient", [
      "interpolate", ["linear"], ["line-progress"],
      0, PATH_DIM,
      fadeStart, PATH_DIM,
      fadeEnd, PATH_WARM,
      1, PATH_WARM_BRIGHT,
    ]);

    // Frame the route once on creation
    if (activeRoute.coordinates.length > 1) {
      const lngs = activeRoute.coordinates.map((coord) => coord[0]);
      const lats = activeRoute.coordinates.map((coord) => coord[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 70, pitch: 58, duration: 800 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, mapReady, snapped?.nearestNodeId]);

  // ── POI bubble markers (DOM markers — crisp text, accessible, no glyphs) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !layout) return;
    void import("maplibre-gl").then((ml) => {
      // Clear and rebuild — bubble content is dynamic (countdowns, selection)
      for (const key of Object.keys(poiMarkersRef.current)) {
        poiMarkersRef.current[key].remove();
      }
      poiMarkersRef.current = {};

      const nodePos = new Map(layout.nodes.map((node) => [node.id, node.pos]));
      for (const poi of layout.pois) {
        // Airline-specific check-in: only show the traveler's airline + generic
        if (poi.category === "checkin" && poi.airline && airlineName && !airlineName.toLowerCase().includes(poi.airline.toLowerCase())) {
          continue;
        }
        if (poi.category === "checkin" && poi.airline && !airlineName) continue;
        const pos = nodePos.get(poi.nodeId);
        if (!pos) continue;

        const isGateBubble = gatePoi !== null && poi.id === gatePoi.id;
        const urgent = isGateBubble && minutesToDeparture <= 45;
        const critical = isGateBubble && minutesToDeparture <= 20;

        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.setAttribute("aria-label", `Navigate to ${poi.name}`);
        bubble.style.cssText = [
          "display:flex;align-items:center;gap:5px;",
          "padding:5px 10px;border-radius:9999px;cursor:pointer;",
          "font:600 11px system-ui,-apple-system,sans-serif;white-space:nowrap;",
          "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);",
          critical
            ? "background:rgba(220,38,38,0.92);color:#fff;border:1px solid #fca5a5;"
            : urgent
            ? "background:rgba(245,158,11,0.92);color:#1f2937;border:1px solid #fde68a;"
            : isGateBubble
            ? "background:rgba(255,255,255,0.95);color:#0b1f3a;border:2px solid #f4c95d;"
            : "background:rgba(255,255,255,0.82);color:#1e293b;border:1px solid rgba(255,255,255,0.5);",
          "box-shadow:0 4px 14px rgba(0,0,0,0.35);",
          critical || urgent ? "animation:kepiPulse 1.6s ease-in-out infinite;" : "",
        ].join("");
        const gateLabel = isGateBubble && gateCode ? `Gate ${gateCode.toUpperCase()}` : poi.name;
        const countdown = isGateBubble && minutesToDeparture > 0 && minutesToDeparture < 600
          ? ` · ${Math.round(minutesToDeparture)}m`
          : "";
        bubble.textContent = `${POI_ICON[poi.category]} ${gateLabel}${countdown}`;
        bubble.addEventListener("click", () => startRoute(poi.id));

        const marker = new ml.Marker({ element: bubble, anchor: "bottom", offset: [0, -6] })
          .setLngLat(pos as [number, number])
          .addTo(map);
        poiMarkersRef.current[poi.id] = marker;
      }
    });
    return () => {
      for (const key of Object.keys(poiMarkersRef.current)) {
        poiMarkersRef.current[key].remove();
      }
      poiMarkersRef.current = {};
    };
  }, [mapReady, layout, gatePoi, gateCode, minutesToDeparture, airlineName, startRoute]);

  // ── Snapped user puck with confidence halo ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!snapped) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }
    void import("maplibre-gl").then((ml) => {
      const haloPx = Math.round(26 + (1 - snapped.confidence) * 50);
      if (!userMarkerRef.current) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;display:flex;align-items:center;justify-content:center;";
        const halo = document.createElement("div");
        halo.dataset.role = "halo";
        const dot = document.createElement("div");
        dot.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#38bdf8;border:2.5px solid #fff;box-shadow:0 0 10px rgba(56,189,248,0.9);position:relative;z-index:1;";
        wrap.appendChild(halo);
        wrap.appendChild(dot);
        userMarkerRef.current = new ml.Marker({ element: wrap, anchor: "center" })
          .setLngLat(snapped.pos as [number, number])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat(snapped.pos as [number, number]);
      }
      const haloEl = userMarkerRef.current.getElement().querySelector('[data-role="halo"]') as HTMLDivElement | null;
      if (haloEl) {
        haloEl.style.cssText = `position:absolute;width:${haloPx}px;height:${haloPx}px;border-radius:50%;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.35);`;
      }
    });
  }, [mapReady, snapped]);

  // ── Render states ──
  if (layoutError) return null; // no curated layout — AirportMode falls back to text guidance

  const nextInstruction = activeRoute?.instructions[0] ?? null;
  const securityQuestionOpen = pendingPoiId !== null && !credentials.known;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1f3a]" style={{ height: 380 }}>
      <style>{`@keyframes kepiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}`}</style>
      <div ref={mapEl} className="absolute inset-0" />

      {/* Header strip */}
      <div className="pointer-events-none absolute left-3 top-3 right-3 flex items-start justify-between gap-2">
        <div className="rounded-xl bg-black/45 px-3 py-1.5 backdrop-blur">
          <p className="text-[11px] font-bold text-white">{layout?.name ?? iata} · Airport Navigator</p>
          <p className="text-[9px] text-sky-200/80">
            Layout beta · positions snap to walkways
            {snapped ? ` · confidence ${Math.round(snapped.confidence * 100)}%` : " · locating…"}
          </p>
        </div>
      </div>

      {/* Loading */}
      {!layout && !layoutError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-semibold text-sky-200/80">Loading terminal map…</p>
        </div>
      )}

      {/* Security credential question (asked once, before first airside route) */}
      {securityQuestionOpen && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Quick one — do you have TSA PreCheck or CLEAR?
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Kepi routes you to the correct security lane. Asked once.</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => answerCredentials(true, false)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">PreCheck</button>
            <button type="button" onClick={() => answerCredentials(false, true)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">CLEAR</button>
            <button type="button" onClick={() => answerCredentials(true, true)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">Both</button>
            <button type="button" onClick={() => answerCredentials(false, false)} className="rounded-lg bg-slate-200 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">Neither</button>
          </div>
        </div>
      )}

      {/* Active route card */}
      {!securityQuestionOpen && activeRoute && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                → {activeDestName} · {fmtMins(activeRoute.totalSeconds)}
                {activeRoute.laneUsed ? ` · ${activeRoute.laneUsed === "precheck" ? "PreCheck" : activeRoute.laneUsed === "clear" ? "CLEAR" : "standard"} lane` : ""}
              </p>
              {nextInstruction && (
                <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-300">{nextInstruction.text}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => setShowInstructions((open) => !open)}
                className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {showInstructions ? "Hide" : "Steps"}
              </button>
              <button
                type="button"
                onClick={() => { setActiveRoute(null); setActiveDestName(null); }}
                className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                End
              </button>
            </div>
          </div>
          {showInstructions && (
            <ol className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {activeRoute.instructions.map((step, stepIdx) => (
                <li key={`${step.maneuver}-${step.atMeters}-${stepIdx}`} className="text-[11px] text-slate-600 dark:text-slate-300">
                  {stepIdx + 1}. {step.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Guide-me CTA when idle */}
      {!securityQuestionOpen && !activeRoute && layout && gatePoi && (
        <div className="absolute inset-x-3 bottom-3">
          <button
            type="button"
            onClick={() => startRoute(gatePoi.id)}
            className="w-full rounded-2xl bg-sky-600 py-2.5 text-sm font-bold text-white shadow-xl"
          >
            🧭 Guide me to {gateCode ? `Gate ${gateCode.toUpperCase()}` : "my gate"}
          </button>
        </div>
      )}
    </div>
  );
}
