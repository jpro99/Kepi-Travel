"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTripTransportRoute,
  segmentKindEmoji,
  segmentStrokeColor,
  type TripTransportSegment,
  type TransportRouteReservation,
} from "@/lib/travelAssistant/tripTransportRoute";
import {
  AIRPORT_SOURCE,
  ROUTE_SOURCE,
  buildAirportGeoJson,
  buildRouteSegmentGeoJson,
  collectRouteMapPoints,
  segmentBounds,
} from "@/lib/travelAssistant/tripRouteMapGeo";
import {
  attachMapStyleErrorFallback,
  buildOsmRasterFallbackStyle,
  directMaptilerTransformRequest,
  resolveLiveMapStyle,
} from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import { useMobileMapExpand, useMapResizeOnLayoutChange } from "@/lib/ui/useMobileMapExpand";
import { useMapUserViewport } from "@/lib/ui/useMapUserViewport";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { ItinerarySelfCheckResult } from "@/lib/travelAssistant/itinerarySelfCheck";

interface TripTransportRouteMapProps {
  reservations: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  selfCheck?: ItinerarySelfCheckResult;
  onSegmentTap?: (reservationId: string) => void;
  /** Taller map + larger labels on phone trip tab */
  mobileProminent?: boolean;
  /** Shorter map chrome when a route banner sits above the tab content */
  compactMobileHeader?: boolean;
  /** Hide legend + horizontal segment cards (mobile flights strip) */
  hideSegmentStrip?: boolean;
  sectionId?: string;
}

function SegmentCard({
  segment,
  index,
  selected,
  cardRef,
  onTap,
  cardStyle = "dark",
}: {
  segment: TripTransportSegment;
  index: number;
  selected: boolean;
  cardRef?: (el: HTMLButtonElement | null) => void;
  onTap?: (segment: TripTransportSegment) => void;
  cardStyle?: "dark" | "card";
}) {
  const color = segmentStrokeColor(segment);
  const clickable = Boolean(onTap);
  const isCard = cardStyle === "card";

  return (
    <button
      ref={cardRef}
      type="button"
      disabled={!clickable}
      onClick={() => onTap?.(segment)}
      className={`min-w-[11rem] shrink-0 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-sky-400/70 bg-sky-500/15 ring-1 ring-sky-400/40"
          : segment.status === "conflict"
            ? isCard
              ? "border-red-300 bg-red-50"
              : "border-red-400/60 bg-red-500/10"
            : segment.booked
              ? isCard
                ? "border-[var(--border-default)] bg-[var(--bg-muted)] hover:opacity-90"
                : "border-white/10 bg-white/5 hover:bg-white/10"
              : isCard
                ? "border-[var(--border-default)] bg-[var(--bg-card)] opacity-90"
                : "border-white/10 bg-white/[0.03] opacity-80"
      } ${clickable ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {segmentKindEmoji(segment.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-black ${isCard ? "text-[var(--text-primary)]" : "text-white"}`}>{segment.headline}</p>
          <p className={`truncate text-xs ${isCard ? "text-[var(--text-muted)]" : "text-sky-50/80"}`}>
            {segment.fromCode} → {segment.toCode}
          </p>
        </div>
        <span className={`text-[10px] font-bold ${isCard ? "text-[var(--text-muted)]" : "text-sky-200/50"}`}>#{index + 1}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
        {segment.dateDisplay ? (
          <span className={`rounded-full px-2 py-0.5 ${isCard ? "bg-[var(--bg-muted)] text-[var(--text-primary)]" : "bg-white/15 text-sky-50"}`}>{segment.dateDisplay}</span>
        ) : null}
        {segment.departDisplay !== "TBD" ? (
          <span className={`rounded-full px-2 py-0.5 ${isCard ? "bg-[var(--bg-muted)] text-[var(--text-primary)]" : "bg-white/15 text-sky-50"}`}>Dep {segment.departDisplay}</span>
        ) : null}
        {segment.arriveDisplay ? (
          <span className={`rounded-full px-2 py-0.5 ${isCard ? "bg-[var(--bg-muted)] text-[var(--text-primary)]" : "bg-white/15 text-sky-50"}`}>Arr {segment.arriveDisplay}</span>
        ) : null}
      </div>
      <p className={`mt-2 text-xs leading-snug ${isCard ? "text-[var(--text-muted)]" : "text-sky-50/75"}`}>{segment.connectionIssue ?? segment.subline}</p>
    </button>
  );
}

function createAirportMarker(code: string, visitCount: number): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center pointer-events-none";
  wrap.style.zIndex = "10";

  const badge = document.createElement("div");
  badge.className =
    "rounded-lg bg-slate-950/90 px-2 py-0.5 text-[11px] font-black text-white shadow-lg ring-1 ring-white/30";
  badge.textContent = code;

  const dot = document.createElement("div");
  dot.className = "mt-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-white/80";

  wrap.append(badge, dot);

  if (visitCount > 1) {
    const count = document.createElement("span");
    count.className =
      "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-slate-950";
    count.textContent = String(visitCount);
    badge.style.position = "relative";
    badge.append(count);
  }

  return wrap;
}

export function TripTransportRouteMap({
  reservations,
  plannedFlightLegs = [],
  selfCheck,
  onSegmentTap,
  mobileProminent = false,
  compactMobileHeader = false,
  hideSegmentStrip = false,
  sectionId,
}: TripTransportRouteMapProps) {
  const route = useMemo(
    () => buildTripTransportRoute(reservations, plannedFlightLegs),
    [plannedFlightLegs, reservations],
  );

  const geoPoints = useMemo(() => collectRouteMapPoints(route.segments), [route.segments]);
  const routeGeoJson = useMemo(() => buildRouteSegmentGeoJson(route.segments), [route.segments]);
  const airportGeoJson = useMemo(() => buildAirportGeoJson(geoPoints), [geoPoints]);
  const hasGeo = geoPoints.length >= 2;

  const routeGeoJsonRef = useRef(routeGeoJson);
  const airportGeoJsonRef = useRef(airportGeoJson);
  routeGeoJsonRef.current = routeGeoJson;
  airportGeoJsonRef.current = airportGeoJson;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const airportMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const ribbonRef = useRef<HTMLDivElement>(null);

  const [mapReady, setMapReady] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const [mapStyle, setMapStyle] = useState<"streets" | "hybrid">("streets");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const appliedStyleRef = useRef<"streets" | "hybrid" | null>(null);
  const usingOsmFallbackRef = useRef(false);
  const isLoadedRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const { expanded, expand, collapse } = useMobileMapExpand(mobileProminent);
  useMapResizeOnLayoutChange(expanded, mapRef);
  const { bindUserInteraction, shouldAutoFit, allowManualFit } = useMapUserViewport();
  const unbindInteractionRef = useRef<(() => void) | null>(null);

  const routeFingerprint = useMemo(
    () => route.segments.map((s) => `${s.id}:${s.fromCode}:${s.toCode}`).join("|"),
    [route.segments],
  );

  useEffect(() => {
    void fetch("/api/config")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { maptilerKey?: string }) => {
        if (data.maptilerKey) setMaptilerKey(data.maptilerKey);
      })
      .catch(() => {});
  }, []);

  const styleSpec = useMemo(
    () => resolveLiveMapStyle(mapStyle === "hybrid" ? "satellite" : "streets", maptilerKey),
    [mapStyle, maptilerKey],
  );

  const geoPointsRef = useRef(geoPoints);
  geoPointsRef.current = geoPoints;

  const fitWholeTrip = useCallback(async (duration = 900) => {
    const map = mapRef.current;
    const points = geoPointsRef.current;
    if (!map || points.length === 0) return;
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) {
      bounds.extend([point.lon, point.lat]);
    }
    map.fitBounds(bounds, { padding: 72, maxZoom: points.length <= 3 ? 10 : 8, duration, essential: true });
  }, []);

  const focusSegment = useCallback(async (segment: TripTransportSegment) => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = segmentBounds(segment);
    if (!bounds) return;
    const maplibregl = await import("maplibre-gl");
    const box = new maplibregl.LngLatBounds(
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    );
    map.fitBounds(box, { padding: 100, maxZoom: 12, duration: 700, essential: true });
  }, []);

  const handleSegmentSelect = useCallback(
    (segment: TripTransportSegment, options?: { openReservation?: boolean }) => {
      setSelectedSegmentId(segment.id);
      void focusSegment(segment);
      cardRefs.current[segment.id]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      if (options?.openReservation && segment.reservationId && onSegmentTap) {
        onSegmentTap(segment.reservationId);
      }
    },
    [focusSegment, onSegmentTap],
  );

  const handleSegmentSelectRef = useRef(handleSegmentSelect);
  handleSegmentSelectRef.current = handleSegmentSelect;

  const installRouteLayers = useCallback((map: import("maplibre-gl").Map) => {
    const routeData = routeGeoJsonRef.current;
    const airportData = airportGeoJsonRef.current;

    if (!map.getSource(ROUTE_SOURCE)) {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData });
    } else {
      (map.getSource(ROUTE_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(routeData);
    }

    if (!map.getLayer("trip-route-unbooked")) {
      map.addLayer({
        id: "trip-route-unbooked",
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["all", ["any", ["!", ["get", "booked"]], ["get", "dashed"]], ["!=", ["get", "status"], "conflict"]],
        paint: {
          "line-color": "#94a3b8",
          "line-width": 4,
          "line-opacity": 0.95,
          "line-dasharray": [2, 2],
        },
      });
    }

    if (!map.getLayer("trip-route-booked")) {
      map.addLayer({
        id: "trip-route-booked",
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["all", ["get", "booked"], ["!", ["get", "dashed"]], ["!=", ["get", "status"], "conflict"]],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3.5,
          "line-opacity": 0.95,
        },
      });
    }

    if (!map.getLayer("trip-route-conflict")) {
      map.addLayer({
        id: "trip-route-conflict",
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["==", ["get", "status"], "conflict"],
        paint: {
          "line-color": "#ef4444",
          "line-width": 6,
          "line-opacity": 1,
          "line-dasharray": [1.5, 1.5],
        },
      });
    }

    if (map.getLayer("trip-route-conflict")) {
      map.moveLayer("trip-route-conflict");
    }

    if (!map.getLayer("trip-route-hit")) {
      map.addLayer({
        id: "trip-route-hit",
        type: "line",
        source: ROUTE_SOURCE,
        paint: {
          "line-width": 16,
          "line-opacity": 0,
        },
      });
    } else {
      map.moveLayer("trip-route-hit");
    }

    if (map.getLayer("trip-route-lines")) {
      map.removeLayer("trip-route-lines");
    }

    if (!map.getSource(AIRPORT_SOURCE)) {
      map.addSource(AIRPORT_SOURCE, { type: "geojson", data: airportData });
    } else {
      (map.getSource(AIRPORT_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(airportData);
    }

    if (!map.getLayer("trip-route-airport-glow")) {
      map.addLayer({
        id: "trip-route-airport-glow",
        type: "circle",
        source: AIRPORT_SOURCE,
        paint: {
          "circle-radius": 10,
          "circle-color": "#38bdf8",
          "circle-opacity": 0.25,
          "circle-stroke-width": 0,
        },
      });
    }
  }, []);

  const renderAirportMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const maplibregl = await import("maplibre-gl");
    for (const marker of airportMarkersRef.current) marker.remove();
    airportMarkersRef.current = [];

    for (const point of geoPointsRef.current) {
      const el = createAirportMarker(point.code, point.visitCount);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
      airportMarkersRef.current.push(marker);
    }
  }, []);

  useEffect(() => {
    if (!hasGeo || !containerRef.current) return;

    let cancelled = false;

    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      usingOsmFallbackRef.current = false;
      isLoadedRef.current = false;
      setMapReady(false);

      const initialStyle = resolveLiveMapStyle("streets", maptilerKey);

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: initialStyle,
        center: [geoPoints[0]?.lon ?? 0, geoPoints[0]?.lat ?? 20],
        zoom: 3,
        maxZoom: 18,
        pixelRatio: getMapPixelRatio(),
        attributionControl: false,
        fadeDuration: 0,
        ...(maptilerKey ? { transformRequest: directMaptilerTransformRequest(maptilerKey) } : {}),
      });
      const unbindResize = bindMapResize(containerRef.current, map);

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;

      const finishMapLoad = (): void => {
        if (cancelled) return;
        appliedStyleRef.current = "streets";
        installRouteLayers(map);
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = bindUserInteraction(map);
        isLoadedRef.current = true;
        setMapReady(true);
        window.requestAnimationFrame(() => {
          try {
            map.resize();
          } catch {
            /* ignore */
          }
        });
        void fitWholeTrip(0);
        void renderAirportMarkers();
      };

      map.on("load", finishMapLoad);

      attachMapStyleErrorFallback(map, {
        isCancelled: () => cancelled,
        isLoaded: () => isLoadedRef.current,
        markLoaded: () => {
          isLoadedRef.current = true;
        },
        usingOsmFallback: usingOsmFallbackRef,
        onRecovered: finishMapLoad,
      });
      map.on("remove", () => {
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = null;
        unbindResize();
      });

      map.on("click", "trip-route-hit", (event) => {
        const feature = event.features?.[0];
        const segmentId = feature?.properties?.segmentId as string | undefined;
        if (!segmentId) return;
        const segment = routeRef.current.segments.find((s) => s.id === segmentId);
        if (segment) handleSegmentSelectRef.current(segment);
      });

      map.on("mouseenter", "trip-route-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "trip-route-hit", () => {
        map.getCanvas().style.cursor = "";
      });
    })();

    return () => {
      cancelled = true;
      unbindInteractionRef.current?.();
      unbindInteractionRef.current = null;
      for (const marker of airportMarkersRef.current) marker.remove();
      airportMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      isLoadedRef.current = false;
      setMapReady(false);
    };
  }, [hasGeo, maptilerKey, bindUserInteraction, fitWholeTrip, installRouteLayers, renderAirportMarkers, geoPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getStyle()?.sprite !== undefined || map.isStyleLoaded()) {
      installRouteLayers(map);
      void renderAirportMarkers();
      if (shouldAutoFit(routeFingerprint)) void fitWholeTrip();
    }
  }, [routeFingerprint, installRouteLayers, renderAirportMarkers, fitWholeTrip, mapReady, shouldAutoFit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const layers = ["trip-route-conflict", "trip-route-booked", "trip-route-unbooked"];
    for (const layerId of layers) {
      if (!map.getLayer(layerId)) continue;
      map.setPaintProperty(layerId, "line-width", [
        "case",
        ["==", ["get", "segmentId"], selectedSegmentId ?? ""],
        layerId === "trip-route-unbooked" ? 6 : 5,
        layerId === "trip-route-unbooked" ? 4 : 3.5,
      ]);
    }
  }, [selectedSegmentId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (usingOsmFallbackRef.current) return;
    if (!maptilerKey) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;
    map.setStyle(styleSpec);
    map.once("idle", () => {
      installRouteLayers(map);
      void renderAirportMarkers();
      if (shouldAutoFit(routeFingerprint)) void fitWholeTrip(0);
    });
  }, [mapStyle, mapReady, maptilerKey, styleSpec, installRouteLayers, renderAirportMarkers, fitWholeTrip, routeFingerprint, shouldAutoFit]);

  if (route.segments.length === 0) return null;

  const mobileLight = mobileProminent && !expanded;
  const sectionShell = expanded
    ? "fixed inset-0 z-[9000] flex max-h-[100dvh] flex-col overflow-hidden bg-slate-950"
    : mobileLight
      ? "overflow-hidden rounded-[var(--radius-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] scroll-mt-4"
      : "overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2447] via-[#0f172a] to-[#020617] shadow-xl ring-1 ring-white/10 scroll-mt-4";

  return (
    <section
      id={expanded ? undefined : sectionId}
      className={sectionShell}
      style={expanded ? { height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
    >
      {expanded ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={collapse}
            className="min-h-[48px] rounded-full px-4 text-[18px] font-semibold text-[#007AFF]"
          >
            Close
          </button>
          <p className="text-[17px] font-bold text-white">Route map</p>
          <button
            type="button"
            onClick={() => {
              allowManualFit();
              void fitWholeTrip();
            }}
            className="min-h-[48px] rounded-full px-4 text-[16px] font-bold text-white/90"
          >
            Fit trip
          </button>
        </div>
      ) : (
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 ${mobileLight ? "border-[var(--border-default)]" : "border-white/10"}`}>
        <div>
          {!compactMobileHeader ? (
            <>
          <p
            className={`font-medium uppercase tracking-wide ${
              mobileLight
                ? "text-[13px] text-[var(--text-tertiary)]"
                : mobileProminent
                  ? "text-base text-sky-300/80"
                  : "text-[10px] tracking-[0.22em] text-sky-300/80"
            }`}
          >
            Trip route map
          </p>
          <h3 className={`mt-0.5 font-semibold ${mobileLight ? "text-[22px] text-[var(--text-primary)]" : mobileProminent ? "text-2xl text-white" : "text-lg text-white"}`}>
            Your whole journey at a glance
          </h3>
            </>
          ) : (
            <h3 className={`font-semibold ${mobileLight ? "text-[22px] text-[var(--text-primary)]" : "text-xl text-white"}`}>
              Route map
            </h3>
          )}
          <p className={`mt-1 ${mobileLight ? "text-[15px] text-[var(--text-secondary)]" : mobileProminent ? "text-[15px] text-sky-100/60" : "text-xs text-sky-100/60"}`}>
            {mobileProminent ? "Tap map for full screen · pinch to zoom" : "Drag to pan · pinch to zoom · tap a leg below"}
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[13px] font-medium ${
            route.summary.allSet
              ? mobileLight
                ? "text-[var(--success)]"
                : "text-emerald-200"
              : route.summary.conflicts > 0
                ? mobileLight
                  ? "text-[var(--destructive)]"
                  : "text-red-200"
                : mobileLight
                  ? "text-[var(--warning)]"
                  : "text-amber-100"
          }`}
        >
          {route.summary.allSet
            ? "All transportation set ✓"
            : route.summary.conflicts > 0
              ? `${route.summary.conflicts} connection issue${route.summary.conflicts === 1 ? "" : "s"}`
              : `${route.summary.unbooked} to book`}
        </div>
      </div>
      )}

      {selfCheck ? (
        <div
          className={`mx-5 mb-3 rounded-2xl border px-4 py-3 ${
            selfCheck.passed
              ? "border-emerald-400/30 bg-emerald-500/10"
              : "border-amber-400/30 bg-amber-500/10"
          }`}
        >
          <p className={`text-xs font-bold ${selfCheck.passed ? "text-emerald-100" : "text-amber-100"}`}>
            {selfCheck.passed ? "✓ Trip verified" : "Trip self-check"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-sky-50/80">{selfCheck.summary}</p>
          <ul className="mt-2 space-y-1">
            {selfCheck.items.slice(0, 4).map((item) => (
              <li key={item.id} className="text-[10px] text-sky-100/70">
                <span
                  className={
                    item.status === "pass"
                      ? "text-emerald-300"
                      : item.status === "warn"
                        ? "text-amber-300"
                        : "text-red-300"
                  }
                >
                  {item.status === "pass" ? "✓" : item.status === "warn" ? "·" : "!"}
                </span>{" "}
                {item.question} — {item.answer}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasGeo ? (
        <div className={`relative ${expanded ? "min-h-0 flex-1" : "px-2 pt-2"}`}>
          <div className={`absolute z-10 flex flex-wrap gap-2 ${expanded ? "left-4 top-4" : "left-4 top-4"}`}>
            {!expanded ? (
            <button
              type="button"
              onClick={() => {
              allowManualFit();
              void fitWholeTrip();
            }}
              className={`rounded-full px-3 py-2 text-[13px] font-bold shadow backdrop-blur ${
                mobileLight ? "bg-white text-slate-800 ring-1 ring-black/10" : "bg-slate-950/80 text-white ring-1 ring-white/20"
              }`}
            >
              Fit whole trip
            </button>
            ) : null}
            {maptilerKey ? (
              <>
                <button
                  type="button"
                  onClick={() => setMapStyle("streets")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold shadow backdrop-blur ${
                    mapStyle === "streets"
                      ? "bg-sky-600 text-white"
                      : mobileLight
                        ? "bg-white text-slate-800 ring-1 ring-black/10"
                        : "bg-slate-950/80 text-white ring-1 ring-white/20"
                  }`}
                >
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("hybrid")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold shadow backdrop-blur ${
                    mapStyle === "hybrid"
                      ? "bg-sky-600 text-white"
                      : mobileLight
                        ? "bg-white text-slate-800 ring-1 ring-black/10"
                        : "bg-slate-950/80 text-white ring-1 ring-white/20"
                  }`}
                >
                  Satellite
                </button>
              </>
            ) : null}
          </div>
          <div className={`relative ${expanded ? "h-full w-full" : ""}`}>
            <div
              ref={containerRef}
              className={`w-full overflow-hidden bg-[#dbeafe] ${
                expanded
                  ? "absolute inset-0 min-h-[240px]"
                  : `rounded-2xl ring-1 ${mobileLight ? "ring-black/10" : "ring-white/10"} ${mobileProminent ? (mobileLight ? "h-[min(52vw,22rem)] min-h-[16rem]" : "h-80 min-h-[16rem]") : "h-64 min-h-[12rem] md:h-80 lg:h-96"}`
              }`}
              role="application"
              aria-label="Interactive trip route map — drag to pan, scroll to zoom"
            />
            {mobileProminent && !expanded ? (
              <button
                type="button"
                onClick={expand}
                className="absolute inset-0 z-[5] flex items-end justify-center rounded-2xl pb-4"
                aria-label="Open full screen route map"
              >
                <span className="rounded-full bg-slate-900/75 px-5 py-3 text-[17px] font-bold text-white shadow-lg backdrop-blur">
                  Tap for full screen map
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
          <p className="text-sm font-semibold text-sky-100/80">Route timeline</p>
          <p className="mt-1 text-xs text-sky-100/50">Add airport codes to flights for the geographic map</p>
        </div>
      )}

      {!hideSegmentStrip ? (
      <div className={`${expanded ? "shrink-0 border-t border-white/10" : ""} px-5 py-4`}>
        <div className={`mb-3 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wider ${mobileLight ? "text-[var(--text-muted)]" : "text-sky-50/80"}`}>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-emerald-500" /> Flight booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-slate-400" /> Not booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-red-500" /> Problem</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-teal-500" /> Train</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-amber-500" /> Ride</span>
        </div>

        <div className="relative mb-4 hidden sm:block">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/10" />
          <div ref={ribbonRef} className="relative flex items-center justify-between gap-2">
            {route.segments.map((segment, index) => {
              const color = segmentStrokeColor(segment);
              const selected = selectedSegmentId === segment.id;
              return (
                <button
                  key={`node-${segment.id}`}
                  type="button"
                  onClick={() => handleSegmentSelect(segment)}
                  className="flex min-w-0 flex-1 flex-col items-center rounded-lg p-1 transition hover:bg-white/5"
                >
                  <div
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm shadow-lg ring-2 ${
                      selected ? "ring-sky-400 scale-110" : "ring-[#0f172a]"
                    }`}
                    style={{ backgroundColor: `${color}33`, boxShadow: `0 0 18px ${color}55` }}
                  >
                    {segmentKindEmoji(segment.kind)}
                  </div>
                  <p className="mt-2 truncate text-[10px] font-black text-white">{segment.fromCode}</p>
                  {index === route.segments.length - 1 ? (
                    <p className="mt-1 truncate text-[10px] font-black text-white">{segment.toCode}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {route.segments.map((segment, index) => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              index={index}
              selected={selectedSegmentId === segment.id}
              cardStyle={mobileLight ? "card" : "dark"}
              cardRef={(el) => {
                cardRefs.current[segment.id] = el;
              }}
              onTap={(seg) => handleSegmentSelect(seg, { openReservation: Boolean(seg.reservationId && onSegmentTap) })}
            />
          ))}
        </div>
      </div>
      ) : null}
    </section>
  );
}
