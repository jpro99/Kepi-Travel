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
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

interface TripTransportRouteMapProps {
  reservations: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onSegmentTap?: (reservationId: string) => void;
}

function SegmentCard({
  segment,
  index,
  selected,
  cardRef,
  onTap,
}: {
  segment: TripTransportSegment;
  index: number;
  selected: boolean;
  cardRef?: (el: HTMLButtonElement | null) => void;
  onTap?: (segment: TripTransportSegment) => void;
}) {
  const color = segmentStrokeColor(segment);
  const clickable = Boolean(onTap);

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
            ? "border-red-400/60 bg-red-500/10"
            : segment.booked
              ? "border-white/10 bg-white/5 hover:bg-white/10"
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
          <p className="truncate text-xs font-black text-white">{segment.headline}</p>
          <p className="truncate text-[10px] text-sky-100/60">
            {segment.fromCode} → {segment.toCode}
          </p>
        </div>
        <span className="text-[10px] font-bold text-sky-200/50">#{index + 1}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {segment.dateDisplay ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">{segment.dateDisplay}</span>
        ) : null}
        {segment.departDisplay !== "TBD" ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">Dep {segment.departDisplay}</span>
        ) : null}
        {segment.arriveDisplay ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">Arr {segment.arriveDisplay}</span>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-sky-100/55">{segment.connectionIssue ?? segment.subline}</p>
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
  onSegmentTap,
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
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    void fetch("/api/config")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { maptilerKey?: string }) => {
        if (data.maptilerKey) setMaptilerKey(data.maptilerKey);
      })
      .catch(() => {});
  }, []);

  const styleUrl = useMemo(() => {
    if (!maptilerKey) return "https://demotiles.maplibre.org/style.json";
    return maptilerStyleUrl(mapStyle === "hybrid" ? "hybrid" : "streets-v2", maptilerKey);
  }, [mapStyle, maptilerKey]);

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
    map.fitBounds(bounds, { padding: 72, maxZoom: points.length <= 3 ? 7 : 5, duration, essential: true });
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
    map.fitBounds(box, { padding: 100, maxZoom: 8, duration: 700, essential: true });
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

    if (!map.getLayer("trip-route-hit")) {
      map.addLayer({
        id: "trip-route-hit",
        type: "line",
        source: ROUTE_SOURCE,
        paint: {
          "line-width": 14,
          "line-opacity": 0,
        },
      });
    }

    if (!map.getLayer("trip-route-lines")) {
      map.addLayer({
        id: "trip-route-lines",
        type: "line",
        source: ROUTE_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": ["case", ["get", "booked"], 0.92, 0.55],
          "line-dasharray": ["case", ["get", "dashed"], ["literal", [2, 2]], ["literal", [1, 0]]],
        },
      });
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

      const initialStyle = maptilerKey
        ? maptilerStyleUrl("streets-v2", maptilerKey)
        : "https://demotiles.maplibre.org/style.json";

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: initialStyle,
        center: [geoPoints[0]?.lon ?? 0, geoPoints[0]?.lat ?? 20],
        zoom: 3,
        attributionControl: false,
        ...(maptilerKey ? { transformRequest: directMaptilerTransformRequest(maptilerKey) } : {}),
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        appliedStyleRef.current = "streets";
        installRouteLayers(map);
        setMapReady(true);
        void fitWholeTrip(0);
        void renderAirportMarkers();
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
      for (const marker of airportMarkersRef.current) marker.remove();
      airportMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [hasGeo, maptilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getStyle()?.sprite !== undefined || map.isStyleLoaded()) {
      installRouteLayers(map);
      void renderAirportMarkers();
      void fitWholeTrip();
    }
  }, [routeGeoJson, airportGeoJson, installRouteLayers, renderAirportMarkers, fitWholeTrip, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("trip-route-lines")) return;
    map.setPaintProperty("trip-route-lines", "line-width", [
      "case",
      ["==", ["get", "segmentId"], selectedSegmentId ?? ""],
      5,
      3,
    ]);
  }, [selectedSegmentId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !maptilerKey) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;
    map.setStyle(styleUrl);
    map.once("idle", () => {
      installRouteLayers(map);
      void renderAirportMarkers();
    });
  }, [mapStyle, mapReady, maptilerKey, styleUrl, installRouteLayers, renderAirportMarkers]);

  if (route.segments.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2447] via-[#0f172a] to-[#020617] shadow-xl ring-1 ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300/80">Trip route map</p>
          <h3 className="mt-1 text-lg font-black text-white">Your whole journey at a glance</h3>
          <p className="mt-1 text-xs text-sky-100/60">
            Drag to pan · scroll or pinch to zoom · tap a route or leg below
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            route.summary.allSet
              ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
              : route.summary.conflicts > 0
                ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40"
                : "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30"
          }`}
        >
          {route.summary.allSet
            ? "All transportation set ✓"
            : route.summary.conflicts > 0
              ? `${route.summary.conflicts} connection issue${route.summary.conflicts === 1 ? "" : "s"}`
              : `${route.summary.unbooked} to book`}
        </div>
      </div>

      {hasGeo ? (
        <div className="relative px-2 pt-2">
          <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fitWholeTrip()}
              className="rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold text-white shadow ring-1 ring-white/20 backdrop-blur"
            >
              Fit whole trip
            </button>
            {maptilerKey ? (
              <>
                <button
                  type="button"
                  onClick={() => setMapStyle("streets")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold shadow backdrop-blur ${
                    mapStyle === "streets" ? "bg-sky-600 text-white" : "bg-slate-950/80 text-white ring-1 ring-white/20"
                  }`}
                >
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("hybrid")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold shadow backdrop-blur ${
                    mapStyle === "hybrid" ? "bg-sky-600 text-white" : "bg-slate-950/80 text-white ring-1 ring-white/20"
                  }`}
                >
                  Satellite
                </button>
              </>
            ) : null}
          </div>
          <div
            ref={containerRef}
            className="h-64 w-full overflow-hidden rounded-2xl ring-1 ring-white/10 md:h-80 lg:h-96"
            role="application"
            aria-label="Interactive trip route map — drag to pan, scroll to zoom"
          />
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
          <p className="text-sm font-semibold text-sky-100/80">Route timeline</p>
          <p className="mt-1 text-xs text-sky-100/50">Add airport codes to flights for the geographic map</p>
        </div>
      )}

      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-sky-100/50">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-emerald-500" /> Flight booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-slate-500" /> Not booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-red-500" /> Problem</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-teal-500" /> Train</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-amber-500" /> Ride</span>
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
              cardRef={(el) => {
                cardRefs.current[segment.id] = el;
              }}
              onTap={(seg) => handleSegmentSelect(seg, { openReservation: Boolean(seg.reservationId && onSegmentTap) })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
