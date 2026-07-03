"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import { useMobileMapExpand, useMapResizeOnLayoutChange } from "@/lib/ui/useMobileMapExpand";
import { useMapUserViewport } from "@/lib/ui/useMapUserViewport";
import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import {
  HOTEL_STAY_SOURCE,
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
  mobileProminent?: boolean;
  sectionId?: string;
  onOpenNotebook?: () => void;
}

function StayCard({
  point,
  index,
  selected,
  onTap,
  cardStyle = "dark",
}: {
  point: HotelStayMapPoint;
  index: number;
  selected: boolean;
  onTap?: (point: HotelStayMapPoint) => void;
  cardStyle?: "dark" | "card";
}) {
  const color = hotelStayStrokeColor(point.booked);
  const isCard = cardStyle === "card";

  return (
    <button
      type="button"
      onClick={() => onTap?.(point)}
      className={`min-w-[11rem] shrink-0 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-sky-400/70 bg-sky-500/15 ring-1 ring-sky-400/40"
          : point.booked
            ? isCard
              ? "border-[var(--border-default)] bg-[var(--bg-muted)] hover:opacity-90"
              : "border-white/10 bg-white/5 hover:bg-white/10"
            : isCard
              ? "border-[var(--border-default)] bg-[var(--bg-card)] opacity-85"
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
          <p className={`truncate text-sm font-black ${isCard ? "text-[var(--text-primary)]" : "text-white"}`}>{point.label}</p>
          <p className={`truncate text-xs ${isCard ? "text-[var(--text-muted)]" : "text-sky-50/80"}`}>{point.city}</p>
        </div>
        <span className={`text-[10px] font-bold ${isCard ? "text-[var(--text-muted)]" : "text-sky-200/50"}`}>#{index + 1}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
        {point.dateLabel ? (
          <span className={`rounded-full px-2 py-0.5 ${isCard ? "bg-[var(--bg-muted)] text-[var(--text-primary)]" : "bg-white/15 text-sky-50"}`}>In {point.dateLabel}</span>
        ) : null}
        {point.checkOut ? (
          <span className={`rounded-full px-2 py-0.5 ${isCard ? "bg-[var(--bg-muted)] text-[var(--text-primary)]" : "bg-white/15 text-sky-50"}`}>
            Out {new Date(`${point.checkOut.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-xs leading-snug ${isCard ? "text-[var(--text-muted)]" : "text-sky-50/75"}`}>
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
  mobileProminent = false,
  sectionId,
  onOpenNotebook,
}: TripHotelStayMapProps) {
  const points = useMemo(
    () => buildHotelStayMapPoints({ reservations, staySegments, plannedStayCities }),
    [plannedStayCities, reservations, staySegments],
  );

  const pointGeoJson = useMemo(() => buildHotelStayPointGeoJson(points), [points]);

  const pointGeoJsonRef = useRef(pointGeoJson);
  pointGeoJsonRef.current = pointGeoJson;

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
  const { expanded, expand, collapse } = useMobileMapExpand(mobileProminent);
  useMapResizeOnLayoutChange(expanded, mapRef);
  const { bindUserInteraction, shouldAutoFit, allowManualFit } = useMapUserViewport();
  const unbindInteractionRef = useRef<(() => void) | null>(null);

  const pointsFingerprint = useMemo(
    () => points.map((p) => `${p.id}:${p.lat}:${p.lon}`).join("|"),
    [points],
  );

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

    if (!map.getSource(HOTEL_STAY_SOURCE)) {
      map.addSource(HOTEL_STAY_SOURCE, { type: "geojson", data: stays });
    } else {
      (map.getSource(HOTEL_STAY_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(stays);
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

  const focusStay = useCallback(async (point: HotelStayMapPoint) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [point.lon, point.lat],
      zoom: 14,
      duration: 700,
      essential: true,
    });
  }, []);

  const handleStaySelect = useCallback(
    (point: HotelStayMapPoint) => {
      setSelectedStayId(point.id);
      void focusStay(point);
    },
    [focusStay],
  );

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
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = bindUserInteraction(map);
        setMapReady(true);
        void fitWholeTrip(0);
        void renderStayMarkers();
      });
      map.on("remove", () => {
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = null;
        unbindResize();
      });
    })();

    return () => {
      cancelled = true;
      unbindInteractionRef.current?.();
      unbindInteractionRef.current = null;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [points.length, maptilerKey, fitWholeTrip, installStayLayers, renderStayMarkers, bindUserInteraction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    installStayLayers(map);
    void renderStayMarkers();
    if (shouldAutoFit(pointsFingerprint)) void fitWholeTrip();
  }, [pointsFingerprint, installStayLayers, renderStayMarkers, fitWholeTrip, mapReady, shouldAutoFit]);

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
          <p className="text-[17px] font-bold text-white">Stay map</p>
          <button
            type="button"
            onClick={() => {
              allowManualFit();
              void fitWholeTrip();
            }}
            className="min-h-[48px] rounded-full px-4 text-[16px] font-bold text-white/90"
          >
            Fit all
          </button>
        </div>
      ) : (
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 ${mobileLight ? "border-[var(--border-default)]" : "border-white/10"}`}>
        <div>
          <p
            className={`font-medium uppercase tracking-wide ${
              mobileLight
                ? "text-[13px] text-[var(--text-tertiary)]"
                : mobileProminent
                  ? "text-base text-sky-300/80"
                  : "text-[10px] tracking-[0.22em] text-sky-300/80"
            }`}
          >
            Stay map
          </p>
          <h3 className={`mt-0.5 font-semibold ${mobileLight ? "text-[22px] text-[var(--text-primary)]" : mobileProminent ? "text-2xl text-white" : "text-lg text-white"}`}>
            Where you&apos;re staying
          </h3>
          <p className={`mt-1 ${mobileLight ? "text-[15px] text-[var(--text-secondary)]" : mobileProminent ? "text-[15px] text-sky-100/60" : "text-xs text-sky-100/60"}`}>
            {mobileProminent ? "Tap map for full screen · pinch to zoom" : "Drag to pan · pinch to zoom"}
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[13px] font-medium ${
            unbookedCount === 0
              ? mobileLight
                ? "text-[var(--success)]"
                : "text-emerald-200"
              : mobileLight
                ? "text-[var(--warning)]"
                : "text-amber-100"
          }`}
        >
          {unbookedCount === 0 ? "All stays booked ✓" : `${unbookedCount} to book`}
        </div>
      </div>
      )}

      <div className={`relative ${expanded ? "min-h-0 flex-1" : "px-2 pt-2"}`}>
        <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          {!expanded ? (
          <button
            type="button"
            onClick={() => {
              allowManualFit();
              void fitWholeTrip();
            }}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold shadow backdrop-blur ${
              mobileLight ? "bg-white text-slate-800 ring-1 ring-black/10" : "bg-slate-950/80 text-white ring-1 ring-white/20"
            }`}
          >
            Fit all stays
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
            className={`w-full overflow-hidden ${
              expanded
                ? "absolute inset-0"
                : `rounded-2xl ring-1 ${mobileLight ? "ring-black/10" : "ring-white/10"} ${mobileProminent ? "h-80" : "h-64 md:h-80 lg:h-96"}`
            }`}
            role="application"
            aria-label="Interactive hotel stay map"
          />
          {mobileProminent && !expanded ? (
            <button
              type="button"
              onClick={expand}
              className="absolute inset-0 z-[5] flex items-end justify-center rounded-2xl pb-4"
              aria-label="Open full screen stay map"
            >
              <span className="rounded-full bg-slate-900/75 px-5 py-2.5 text-[16px] font-bold text-white shadow-lg backdrop-blur">
                Tap for full screen map
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${expanded ? "shrink-0 border-t border-[var(--border-default)]" : ""} px-4 py-3`}>
        {mobileProminent && onOpenNotebook ? (
          <button
            type="button"
            onClick={onOpenNotebook}
            className="mb-3 flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--bg-card)] px-4 text-[17px] font-semibold text-[var(--text-primary)]"
          >
            Open stay notebook
          </button>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {points.map((point, index) => (
            <StayCard
              key={point.id}
              point={point}
              index={index}
              selected={selectedStayId === point.id}
              cardStyle={mobileLight ? "card" : "dark"}
              onTap={(p) => {
                handleStaySelect(p);
                if (onStayTap && p.reservationId) onStayTap(p);
              }}
            />
          ))}
        </div>
        <p className={`mt-2 text-[13px] ${mobileLight ? "text-[var(--text-tertiary)]" : "text-sky-100/55"}`}>
          {bookedCount} booked · {unbookedCount} still needed · {points.length} stop{points.length === 1 ? "" : "s"} on map
        </p>
      </div>
    </section>
  );
}
