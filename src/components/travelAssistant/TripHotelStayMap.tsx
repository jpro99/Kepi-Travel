"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import {
  HOTEL_STAY_LINE_SOURCE,
  HOTEL_STAY_SOURCE,
  buildHotelStayLineGeoJson,
  buildHotelStayMapPoints,
  buildHotelStayPointGeoJson,
  hotelStayStrokeColor,
  type HotelStayMapPoint,
  type HotelStayMapReservation,
} from "@/lib/travelAssistant/tripHotelStayMap";

interface TripHotelStayMapProps {
  reservations: HotelStayMapReservation[];
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  onStayTap?: (point: HotelStayMapPoint) => void;
}

function StayCard({
  point,
  index,
  selected,
  onTap,
}: {
  point: HotelStayMapPoint;
  index: number;
  selected: boolean;
  onTap?: (point: HotelStayMapPoint) => void;
}) {
  const color = hotelStayStrokeColor(point.booked);

  return (
    <button
      type="button"
      onClick={() => onTap?.(point)}
      className={`min-w-[11rem] shrink-0 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-sky-400/70 bg-sky-500/15 ring-1 ring-sky-400/40"
          : point.booked
            ? "border-white/10 bg-white/5 hover:bg-white/10"
            : "border-white/10 bg-white/[0.03] opacity-85"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
          style={{ backgroundColor: `${color}22`, color }}
        >
          🏨
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{point.label}</p>
          <p className="truncate text-xs text-sky-50/80">{point.city}</p>
        </div>
        <span className="text-[10px] font-bold text-sky-200/50">#{index + 1}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
        {point.dateLabel ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-sky-50">In {point.dateLabel}</span>
        ) : null}
        {point.checkOut ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-sky-50">
            Out {new Date(`${point.checkOut.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-snug text-sky-50/75">
        {point.booked ? "Booked stay" : "Hotel not booked yet"}
      </p>
    </button>
  );
}

function createStayMarker(label: string, booked: boolean): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center pointer-events-none";
  wrap.style.zIndex = booked ? "12" : "11";

  const badge = document.createElement("div");
  badge.className = `max-w-[8rem] truncate rounded-lg px-2 py-0.5 text-[11px] font-black text-white shadow-lg ring-2 ${
    booked ? "bg-emerald-600 ring-emerald-300/80" : "bg-slate-500 ring-slate-300/60"
  }`;
  badge.style.borderStyle = booked ? "solid" : "dashed";
  badge.textContent = label.length > 18 ? `${label.slice(0, 16)}…` : label;

  const dot = document.createElement("div");
  dot.className = `mt-0.5 h-3 w-3 rounded-full ring-2 ring-white/80 ${booked ? "bg-emerald-400" : "bg-slate-400"}`;

  wrap.append(badge, dot);
  return wrap;
}

export function TripHotelStayMap({
  reservations,
  staySegments = [],
  plannedStayCities = [],
  onStayTap,
}: TripHotelStayMapProps) {
  const points = useMemo(
    () => buildHotelStayMapPoints({ reservations, staySegments, plannedStayCities }),
    [plannedStayCities, reservations, staySegments],
  );

  const pointGeoJson = useMemo(() => buildHotelStayPointGeoJson(points), [points]);
  const lineGeoJson = useMemo(() => buildHotelStayLineGeoJson(points), [points]);

  const pointGeoJsonRef = useRef(pointGeoJson);
  const lineGeoJsonRef = useRef(lineGeoJson);
  pointGeoJsonRef.current = pointGeoJson;
  lineGeoJsonRef.current = lineGeoJson;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const [mapReady, setMapReady] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const [mapStyle, setMapStyle] = useState<"streets" | "hybrid">("streets");
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const appliedStyleRef = useRef<"streets" | "hybrid" | null>(null);

  const bookedCount = points.filter((p) => p.booked).length;
  const unbookedCount = points.length - bookedCount;

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

  const fitWholeTrip = useCallback(async (duration = 900) => {
    const map = mapRef.current;
    const stayPoints = pointsRef.current;
    if (!map || stayPoints.length === 0) return;
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    for (const point of stayPoints) {
      bounds.extend([point.lon, point.lat]);
    }
    map.fitBounds(bounds, {
      padding: 72,
      maxZoom: stayPoints.length === 1 ? 14 : 10,
      duration,
      essential: true,
    });
  }, []);

  const installStayLayers = useCallback((map: import("maplibre-gl").Map) => {
    const stays = pointGeoJsonRef.current;
    const lines = lineGeoJsonRef.current;

    if (!map.getSource(HOTEL_STAY_LINE_SOURCE)) {
      map.addSource(HOTEL_STAY_LINE_SOURCE, { type: "geojson", data: lines });
    } else {
      (map.getSource(HOTEL_STAY_LINE_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(lines);
    }

    if (!map.getSource(HOTEL_STAY_SOURCE)) {
      map.addSource(HOTEL_STAY_SOURCE, { type: "geojson", data: stays });
    } else {
      (map.getSource(HOTEL_STAY_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(stays);
    }

    if (!map.getLayer("trip-hotel-lines-unbooked")) {
      map.addLayer({
        id: "trip-hotel-lines-unbooked",
        type: "line",
        source: HOTEL_STAY_LINE_SOURCE,
        filter: ["!", ["get", "booked"]],
        paint: {
          "line-color": "#94a3b8",
          "line-width": 3,
          "line-opacity": 0.85,
          "line-dasharray": [2, 2],
        },
      });
    }

    if (!map.getLayer("trip-hotel-lines-booked")) {
      map.addLayer({
        id: "trip-hotel-lines-booked",
        type: "line",
        source: HOTEL_STAY_LINE_SOURCE,
        filter: ["get", "booked"],
        paint: {
          "line-color": "#22c55e",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
    }

    if (!map.getLayer("trip-hotel-stay-glow")) {
      map.addLayer({
        id: "trip-hotel-stay-glow",
        type: "circle",
        source: HOTEL_STAY_SOURCE,
        paint: {
          "circle-radius": 12,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.28,
          "circle-stroke-width": 0,
        },
      });
    }
  }, []);

  const renderStayMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const maplibregl = await import("maplibre-gl");
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const point of pointsRef.current) {
      const el = createStayMarker(point.city, point.booked);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, []);

  const handleStaySelect = useCallback(
    (point: HotelStayMapPoint) => {
      setSelectedStayId(point.id);
      void fitWholeTrip(700);
      onStayTap?.(point);
    },
    [fitWholeTrip, onStayTap],
  );

  const handleStaySelectRef = useRef(handleStaySelect);
  handleStaySelectRef.current = handleStaySelect;

  useEffect(() => {
    if (points.length === 0 || !containerRef.current) return;

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
        center: [points[0]?.lon ?? 0, points[0]?.lat ?? 20],
        zoom: 4,
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

      map.on("load", () => {
        if (cancelled) return;
        appliedStyleRef.current = "streets";
        installStayLayers(map);
        setMapReady(true);
        void fitWholeTrip(0);
        void renderStayMarkers();
      });
      map.on("remove", () => unbindResize());
    })();

    return () => {
      cancelled = true;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [points.length, maptilerKey, fitWholeTrip, installStayLayers, renderStayMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    installStayLayers(map);
    void renderStayMarkers();
    void fitWholeTrip();
  }, [pointGeoJson, lineGeoJson, installStayLayers, renderStayMarkers, fitWholeTrip, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !maptilerKey) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;
    map.setStyle(styleUrl);
    map.once("idle", () => {
      installStayLayers(map);
      void renderStayMarkers();
    });
  }, [mapStyle, mapReady, maptilerKey, styleUrl, installStayLayers, renderStayMarkers]);

  if (points.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2447] via-[#0f172a] to-[#020617] shadow-xl ring-1 ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300/80">Stay map</p>
          <h3 className="mt-1 text-lg font-black text-white">Where you&apos;re staying</h3>
          <p className="mt-1 text-xs text-sky-100/60">
            Drag to pan · scroll or pinch to zoom · green = booked, gray = still needed
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            unbookedCount === 0
              ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
              : "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30"
          }`}
        >
          {unbookedCount === 0
            ? "All stays booked ✓"
            : `${unbookedCount} to book`}
        </div>
      </div>

      <div className="relative px-2 pt-2">
        <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void fitWholeTrip()}
            className="rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold text-white shadow ring-1 ring-white/20 backdrop-blur"
          >
            Fit all stays
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
          aria-label="Interactive hotel stay map"
        />
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wider text-sky-50/80">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-emerald-500" /> Booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-7 rounded-full bg-slate-400" /> Not booked</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {points.map((point, index) => (
            <StayCard
              key={point.id}
              point={point}
              index={index}
              selected={selectedStayId === point.id}
              onTap={handleStaySelect}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-sky-100/55">
          {bookedCount} booked · {unbookedCount} still needed · {points.length} stop{points.length === 1 ? "" : "s"} on map
        </p>
      </div>
    </section>
  );
}
