"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitScoreRange, hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import {
  HOTEL_CHAIN_MAP_COLORS,
  INDEPENDENT_HOTEL_MAP_COLOR,
} from "@/lib/hotels/hotelChainDisplay";
import type { HotelMapPinOptions } from "@/lib/hotels/hotelMapColors";
import {
  buildHotelStayDistrictGeoJson,
  resolveHotelStayDistricts,
  type HotelStayDistrict,
} from "@/lib/hotels/hotelStayDistricts";
import type { HotelChainId } from "@/lib/loyalty/chainRegistry";
import type { MapBounds } from "@/lib/hotels/hotelCoordinates";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import type { HotelPayMode } from "@/lib/hotels/hotelPointsDisplay";
import { resolveHotelMapPinLabel } from "@/lib/hotels/hotelPointsDisplay";
import type { TransitKind, TransitStop } from "@/lib/hotels/nearbyTransit";
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
  enabledChains?: Set<HotelChainId>;
  chainFilterActive?: boolean;
}

const DISTRICT_SOURCE = "hotel-stay-districts";

function createPricePin(
  hotel: RankedHotelSearchResult,
  selected: boolean,
  style: ReturnType<typeof hotelMapPinStyle>,
  payMode: HotelPayMode,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  const pin = resolveHotelMapPinLabel(hotel, payMode);
  el.title = pin.title;
  el.className = "flex flex-col items-center border-0 bg-transparent p-0";
  el.style.zIndex = selected ? "30" : "20";

  const badge = document.createElement("span");
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
  badge.className = `rounded-lg font-black shadow-md ${compact ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]"} ${selected ? "scale-110" : ""}`;
  badge.style.backgroundColor = style.bg;
  badge.style.color = style.text;
  badge.style.boxShadow = selected
    ? `0 0 0 2px ${style.ring}, 0 0 0 4px rgba(255,255,255,0.9)`
    : style.fitLabel === "Top match"
      ? `0 0 0 2px ${style.ring}`
      : undefined;
  badge.textContent = pin.text;

  const dot = document.createElement("span");
  dot.className = "mt-0.5 h-1.5 w-1.5 rounded-full";
  dot.style.backgroundColor = style.bg;

  el.style.opacity = style.dimmed ? "0.42" : "1";
  el.style.filter = style.dimmed ? "saturate(0.85)" : "none";

  el.append(badge, dot);
  return el;
}

function transitMarkerStyle(kind: TransitKind): { label: string; bg: string } {
  if (kind === "train") return { label: "T", bg: "#0c4a6e" };
  if (kind === "tram") return { label: "♦", bg: "#0369a1" };
  if (kind === "bus") return { label: "B", bg: "#475569" };
  return { label: "M", bg: "#0284c7" };
}

function createTransitMarker(stop: TransitStop): HTMLButtonElement {
  const style = transitMarkerStyle(stop.kind);
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.title = stop.name;
  wrap.className = "group flex flex-col items-center border-0 bg-transparent p-0";
  wrap.style.zIndex = "10";

  const badge = document.createElement("span");
  badge.className =
    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white shadow ring-2 ring-white";
  badge.style.backgroundColor = style.bg;
  badge.textContent = style.label;

  const label = document.createElement("span");
  const shortName = stop.name.split(/[,(]/)[0]?.trim() || stop.name;
  label.className =
    "mt-0.5 max-w-[5.5rem] truncate rounded bg-slate-950/90 px-1 py-0.5 text-[8px] font-semibold leading-tight text-white";
  label.textContent = shortName;

  wrap.append(badge, label);
  return wrap;
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
  enabledChains,
  chainFilterActive = false,
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
  const [selectedDistrict, setSelectedDistrict] = useState<HotelStayDistrict | null>(null);

  const districts = useMemo(() => resolveHotelStayDistricts(city), [city]);
  const districtGeoJson = useMemo(() => buildHotelStayDistrictGeoJson(districts), [districts]);

  const pinOptions = useMemo<HotelMapPinOptions>(
    () => ({ enabledChains, chainFilterActive }),
    [enabledChains, chainFilterActive],
  );

  const scoreRange = useMemo(() => fitScoreRange(hotels), [hotels]);

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
      const style = hotelMapPinStyle(hotel, scoreRange, pinOptions);
      const el = createPricePin(hotel, selectedId === hotel.id, style, payMode);
      el.onclick = () => onSelect(hotel);

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([hotel.lng, hotel.lat])
        .addTo(mapRef.current);
      hotelMarkersRef.current.push(marker);
    }
  }, [ready, hotels, selectedId, onSelect, scoreRange, payMode, pinOptions]);

  const installDistrictLayers = useCallback(
    (map: import("maplibre-gl").Map) => {
      if (districts.length === 0) {
        if (map.getLayer("hotel-district-fill")) map.removeLayer("hotel-district-fill");
        if (map.getLayer("hotel-district-outline")) map.removeLayer("hotel-district-outline");
        if (map.getSource(DISTRICT_SOURCE)) map.removeSource(DISTRICT_SOURCE);
        return;
      }

      const data = districtGeoJson;
      if (!map.getSource(DISTRICT_SOURCE)) {
        map.addSource(DISTRICT_SOURCE, { type: "geojson", data });
      } else {
        (map.getSource(DISTRICT_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(data);
      }

      if (!map.getLayer("hotel-district-fill")) {
        map.addLayer({
          id: "hotel-district-fill",
          type: "fill",
          source: DISTRICT_SOURCE,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.12,
          },
        });
      }
      if (!map.getLayer("hotel-district-outline")) {
        map.addLayer({
          id: "hotel-district-outline",
          type: "line",
          source: DISTRICT_SOURCE,
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.55,
          },
        });
      }
    },
    [districtGeoJson, districts.length],
  );

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
      const el = createTransitMarker(stop);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(mapRef.current);
      transitMarkersRef.current.push(marker);
    }
  }, [ready, showTransit, transitStops]);

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
        if (mapRef.current) installDistrictLayers(mapRef.current);
        void renderHotelMarkers();
        void renderTransitMarkers();
        if (mapRef.current) emitBounds(mapRef.current);
      });
    },
    [emitBounds, installDistrictLayers, maptilerKey, renderHotelMarkers, renderTransitMarkers],
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
          emitBounds(map);
          scheduleTransitFetch(centerLat, centerLng);
        }
      });
      map.on("remove", () => unbindResize());
      map.on("moveend", () => {
        emitBounds(map);
        const center = map.getCenter();
        scheduleTransitFetch(center.lat, center.lng);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    installDistrictLayers(map);

    const onDistrictClick = (event: import("maplibre-gl").MapMouseEvent): void => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["hotel-district-fill"] });
      const props = features[0]?.properties as { id?: string } | undefined;
      if (props?.id) {
        const hit = districts.find((district) => district.id === props.id);
        if (hit) {
          setSelectedDistrict(hit);
          return;
        }
      }
      setSelectedDistrict(null);
    };

    const onEnter = (): void => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = (): void => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", onDistrictClick);
    map.on("mouseenter", "hotel-district-fill", onEnter);
    map.on("mouseleave", "hotel-district-fill", onLeave);

    return () => {
      map.off("click", onDistrictClick);
      map.off("mouseenter", "hotel-district-fill", onEnter);
      map.off("mouseleave", "hotel-district-fill", onLeave);
    };
  }, [ready, installDistrictLayers, districts]);

  useEffect(() => {
    setSelectedDistrict(null);
  }, [city]);

  const trainCount = transitStops.filter((stop) => stop.kind === "train").length;
  const metroCount = transitStops.filter((stop) => stop.kind === "metro" || stop.kind === "tram").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 overflow-visible rounded-2xl bg-white px-4 py-3 text-xs shadow-sm dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          {Object.values(HOTEL_CHAIN_MAP_COLORS).map((chain) => (
            <span key={chain.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chain.bg }} />
              {chain.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: INDEPENDENT_HOTEL_MAP_COLOR.bg }}
            />
            Other
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-[#f4c95d] ring-offset-1" style={{ backgroundColor: "#5b21b6" }} />
            Gold ring = top match for you
          </span>
          {chainFilterActive ? (
            <span className="text-slate-500">Dimmed pins = chains you unchecked (still on map)</span>
          ) : null}
        </div>

        {districts.length > 0 ? (
          <p className="w-full text-[10px] text-slate-500">
            Tap a shaded district outline for area guide — where locals and travelers usually stay.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0284c7] text-[8px] font-black text-white">
              M
            </span>
            Metro
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0c4a6e] text-[8px] font-black text-white">
              T
            </span>
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
        {city} · {hotels.length} on map · {showTransit ? `${metroCount} metro · ${trainCount} rail` : "transit off"}
        {districts.length > 0 ? ` · ${districts.length} districts` : ""}
      </p>

      {selectedDistrict ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                {selectedDistrict.name}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selectedDistrict.headline}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedDistrict.whyStay}</p>
              <p className="mt-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
                {selectedDistrict.popularPick}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDistrict(null)}
              className="shrink-0 text-xs font-semibold text-slate-500"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
