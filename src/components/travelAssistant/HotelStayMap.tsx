"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import { createTransitMarker } from "@/lib/hotels/hotelMapTransitMarkers";
import type { MapBounds } from "@/lib/hotels/hotelCoordinates";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import type { HotelPayMode } from "@/lib/hotels/hotelPointsDisplay";
import { resolveHotelMapPinLabel } from "@/lib/hotels/hotelPointsDisplay";
import type { TransitStop } from "@/lib/hotels/nearbyTransit";
import type { HotelChainId } from "@/lib/loyalty/chainRegistry";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

import { HotelPriceRangeSlider } from "@/components/travelAssistant/HotelPriceRangeSlider";

interface HotelWithCoords extends RankedHotelSearchResult {
  lat: number;
  lng: number;
}

interface HotelStayMapProps {
  city: string;
  centerLat: number;
  centerLng: number;
  hotels: HotelWithCoords[];
  selectedId: string | null;
  onSelect: (hotel: RankedHotelSearchResult) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  expanded?: boolean;
  payMode?: HotelPayMode;
  priceMin?: number;
  priceMax?: number;
  priceBounds?: { min: number; max: number };
  onPriceRangeChange?: (min: number, max: number) => void;
  onOpenPreferences?: () => void;
  hiddenCount?: number;
  onShowHidden?: () => void;
  /** Loyalty chains the traveler prioritizes — pins use navy/gold for these. */
  preferredChainIds?: HotelChainId[];
}

function createPricePin(
  hotel: RankedHotelSearchResult,
  selected: boolean,
  style: ReturnType<typeof hotelMapPinStyle>,
  payMode: HotelPayMode,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  const pin = resolveHotelMapPinLabel(hotel, payMode);
  el.title = `${pin.title} · ${style.label}`;
  el.className = "flex flex-col items-center border-0 bg-transparent p-0";
  el.style.zIndex = selected ? "30" : "20";

  const badge = document.createElement("span");
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
  badge.className = `rounded-lg font-black shadow-md ${compact ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]"} ${selected ? "ring-2 ring-white scale-110" : ""}`;
  badge.style.backgroundColor = style.bg;
  badge.style.color = style.text;
  if (selected) badge.style.boxShadow = `0 0 0 2px ${style.ring}`;
  badge.textContent = pin.text;

  const dot = document.createElement("span");
  dot.className = "mt-0.5 h-1.5 w-1.5 rounded-full";
  dot.style.backgroundColor = style.bg;

  el.append(badge, dot);
  return el;
}

export function HotelStayMap({
  city,
  centerLat,
  centerLng,
  hotels,
  selectedId,
  onSelect,
  onBoundsChange,
  expanded = false,
  payMode = "any",
  priceMin,
  priceMax,
  priceBounds,
  onPriceRangeChange,
  onOpenPreferences,
  hiddenCount = 0,
  onShowHidden,
  preferredChainIds = [],
}: HotelStayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const hotelMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const transitMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const transitFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const [mapStyle, setMapStyle] = useState<"hybrid" | "streets">("streets");
  const [showTransit, setShowTransit] = useState(true);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [transitCenter, setTransitCenter] = useState({ lat: centerLat, lng: centerLng });
  const [mapZoom, setMapZoom] = useState(14);

  const pinOptions = useMemo(() => ({ preferredChainIds }), [preferredChainIds]);
  const hasPreferredChains = preferredChainIds.length > 0;
  const showTransitLabels = mapZoom >= 13.5;

  useEffect(() => {
    void fetch("/api/config")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { maptilerKey?: string }) => {
        if (data.maptilerKey) setMaptilerKey(data.maptilerKey);
      })
      .catch(() => {});
  }, []);

  const emitBounds = useCallback(
    (map: import("maplibre-gl").Map) => {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
    [onBoundsChange],
  );

  const renderHotelMarkers = useCallback(async () => {
    if (!ready || !mapRef.current) return;
    const maplibregl = await import("maplibre-gl");
    for (const marker of hotelMarkersRef.current) marker.remove();
    hotelMarkersRef.current = [];

    for (const hotel of hotels) {
      const style = hotelMapPinStyle(hotel, pinOptions);
      const el = createPricePin(hotel, selectedId === hotel.id, style, payMode);
      el.onclick = () => onSelect(hotel);

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([hotel.lng, hotel.lat])
        .addTo(mapRef.current);
      hotelMarkersRef.current.push(marker);
    }
  }, [ready, hotels, selectedId, onSelect, pinOptions, payMode]);

  const renderTransitMarkers = useCallback(async () => {
    if (!ready || !mapRef.current || !showTransit) {
      for (const marker of transitMarkersRef.current) marker.remove();
      transitMarkersRef.current = [];
      return;
    }

    const maplibregl = await import("maplibre-gl");
    for (const marker of transitMarkersRef.current) marker.remove();
    transitMarkersRef.current = [];

    for (const stop of transitStops) {
      const el = createTransitMarker(stop, { showLabel: showTransitLabels });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(mapRef.current);
      transitMarkersRef.current.push(marker);
    }
  }, [ready, showTransit, transitStops, showTransitLabels]);

  const scheduleTransitFetch = useCallback((lat: number, lng: number) => {
    if (transitFetchTimerRef.current) clearTimeout(transitFetchTimerRef.current);
    transitFetchTimerRef.current = setTimeout(() => {
      setTransitCenter({ lat, lng });
    }, 450);
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || hotels.length === 0) return;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([centerLng, centerLat]);
      for (const hotel of hotels) {
        bounds.extend([hotel.lng, hotel.lat]);
      }
      mapRef.current?.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 500 });
    })();
  }, [ready, hotels, centerLat, centerLng]);

  const applyMapStyle = useCallback(
    (nextStyle: "hybrid" | "streets") => {
      if (!mapRef.current || !maptilerKey) return;
      setMapStyle(nextStyle);
      const style = maptilerStyleUrl(nextStyle === "hybrid" ? "hybrid" : "streets-v2", maptilerKey);
      mapRef.current.setStyle(style);
      mapRef.current.once("idle", () => {
        void renderHotelMarkers();
        void renderTransitMarkers();
        if (mapRef.current) emitBounds(mapRef.current);
      });
    },
    [emitBounds, maptilerKey, renderHotelMarkers, renderTransitMarkers],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const style = maptilerKey
        ? maptilerStyleUrl("streets-v2", maptilerKey)
        : "https://demotiles.maplibre.org/style.json";

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [centerLng, centerLat],
        zoom: 14,
        maxZoom: 18,
        pixelRatio: getMapPixelRatio(),
        attributionControl: false,
        fadeDuration: 0,
        ...(maptilerKey ? { transformRequest: directMaptilerTransformRequest(maptilerKey) } : {}),
      });
      const unbindResize = bindMapResize(containerRef.current, map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        if (!cancelled) {
          setReady(true);
          setMapZoom(map.getZoom());
          emitBounds(map);
          scheduleTransitFetch(centerLat, centerLng);
        }
      });
      map.on("remove", () => unbindResize());
      map.on("moveend", () => {
        emitBounds(map);
        const center = map.getCenter();
        setMapZoom(map.getZoom());
        scheduleTransitFetch(center.lat, center.lng);
      });
      map.on("zoomend", () => {
        setMapZoom(map.getZoom());
      });
    })();

    return () => {
      cancelled = true;
      if (transitFetchTimerRef.current) clearTimeout(transitFetchTimerRef.current);
      for (const marker of hotelMarkersRef.current) marker.remove();
      for (const marker of transitMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];
      transitMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [centerLat, centerLng, maptilerKey, emitBounds, scheduleTransitFetch]);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/hotels/transit-nearby?lat=${transitCenter.lat}&lng=${transitCenter.lng}&kind=all`,
      { cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : { stops: [] }))
      .then((data: { stops?: TransitStop[] }) => {
        if (!cancelled) setTransitStops(Array.isArray(data.stops) ? data.stops : []);
      })
      .catch(() => {
        if (!cancelled) setTransitStops([]);
      });
    return () => {
      cancelled = true;
    };
  }, [transitCenter.lat, transitCenter.lng]);

  useEffect(() => {
    void renderHotelMarkers();
  }, [renderHotelMarkers]);

  useEffect(() => {
    void renderTransitMarkers();
  }, [renderTransitMarkers]);

  const trainCount = transitStops.filter((stop) => stop.kind === "train").length;
  const metroCount = transitStops.filter((stop) => stop.kind === "metro" || stop.kind === "tram").length;
  const busCount = transitStops.filter((stop) => stop.kind === "bus").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 overflow-visible rounded-2xl bg-white px-4 py-3 text-xs shadow-sm dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          {hasPreferredChains ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#0b1f3a] ring-1 ring-[#f4c95d]" /> Your program
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-500" /> Other chain
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-600" /> Independent
              </span>
            </>
          ) : (
            <span className="text-slate-500">Set hotel loyalty in your travel profile for color-coded pins</span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-[8px] font-black text-white">M</span>
            Metro
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[8px] font-black text-white">T</span>
            Train
          </span>
        </div>

        {priceBounds && priceMin != null && priceMax != null && onPriceRangeChange ? (
          <HotelPriceRangeSlider
            minBound={priceBounds.min}
            maxBound={priceBounds.max}
            valueMin={priceMin}
            valueMax={priceMax}
            onChange={onPriceRangeChange}
            disabled={!priceBounds.max}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {onOpenPreferences ? (
            <button
              type="button"
              onClick={onOpenPreferences}
              className="rounded-full bg-[#f4c95d] px-3 py-1 text-xs font-bold text-[#0b1f3a]"
            >
              Refine
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowTransit((value) => !value)}
            className={`rounded-full px-3 py-1 font-semibold ${showTransit ? "bg-slate-800 text-white" : "text-slate-600"}`}
          >
            Transit {showTransit ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => applyMapStyle("streets")}
            className={`rounded-full px-3 py-1 font-semibold ${mapStyle === "streets" ? "bg-slate-800 text-white" : "text-slate-600"}`}
          >
            Streets
          </button>
          <button
            type="button"
            onClick={() => applyMapStyle("hybrid")}
            className={`rounded-full px-3 py-1 font-semibold ${mapStyle === "hybrid" ? "bg-slate-800 text-white" : "text-slate-600"}`}
          >
            Satellite
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-2xl shadow-sm ${
          expanded ? "h-[min(72vh,42rem)] min-h-[24rem]" : "h-64 md:h-80 lg:h-[28rem]"
        }`}
      />

      <p className="text-xs text-slate-500">
        {city} · {hotels.length} on map
        {showTransit
          ? ` · ${metroCount} metro${metroCount === 1 ? "" : "s"}${trainCount > 0 ? ` · ${trainCount} rail` : ""}${busCount > 0 ? ` · ${busCount} bus` : ""}`
          : " · transit off"}
        {showTransit && metroCount === 0 && trainCount === 0 ? " · zoom or pan to load nearby stations" : ""}
      </p>
    </div>
  );
}
