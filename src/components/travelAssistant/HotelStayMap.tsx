"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitScoreRange, hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import type { MapBounds } from "@/lib/hotels/hotelCoordinates";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";
import type { TransitStop } from "@/lib/hotels/nearbyTransit";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

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
}

function createPricePin(
  hotel: RankedHotelSearchResult,
  selected: boolean,
  style: ReturnType<typeof hotelMapPinStyle>,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.title = `${hotel.name} · $${Math.round(hotel.pricePerNight)}/night`;
  el.className = "flex flex-col items-center border-0 bg-transparent p-0";

  const badge = document.createElement("span");
  badge.className = `rounded-lg px-1.5 py-0.5 text-[10px] font-black shadow-md ${selected ? "ring-2 ring-white scale-110" : ""}`;
  badge.style.backgroundColor = style.bg;
  badge.style.color = style.text;
  if (selected) badge.style.boxShadow = `0 0 0 2px ${style.ring}`;
  badge.textContent = `$${Math.round(hotel.pricePerNight)}`;

  const dot = document.createElement("span");
  dot.className = "mt-0.5 h-1.5 w-1.5 rounded-full";
  dot.style.backgroundColor = style.bg;

  el.append(badge, dot);
  return el;
}

function createMetroMarker(name: string): HTMLButtonElement {
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.title = name;
  wrap.className = "group flex flex-col items-center border-0 bg-transparent p-0";

  const badge = document.createElement("span");
  badge.className =
    "flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-[10px] font-black text-white shadow ring-2 ring-white";
  badge.textContent = "M";

  const label = document.createElement("span");
  label.className =
    "mt-0.5 max-w-[5rem] truncate rounded bg-violet-950/90 px-1 py-0.5 text-[8px] font-semibold text-violet-100 opacity-0 group-hover:opacity-100";
  label.textContent = name;

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
}: HotelStayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const hotelMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const transitMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const [mapStyle, setMapStyle] = useState<"hybrid" | "streets">("hybrid");
  const [metroStops, setMetroStops] = useState<TransitStop[]>([]);

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
      const style = hotelMapPinStyle(hotel, scoreRange);
      const el = createPricePin(hotel, selectedId === hotel.id, style);
      el.onclick = () => onSelect(hotel);

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([hotel.lng, hotel.lat])
        .addTo(mapRef.current);
      hotelMarkersRef.current.push(marker);
    }
  }, [ready, hotels, selectedId, onSelect, scoreRange]);

  const applyMapStyle = useCallback(
    (nextStyle: "hybrid" | "streets") => {
      if (!mapRef.current || !maptilerKey) return;
      setMapStyle(nextStyle);
      const style = maptilerStyleUrl(nextStyle === "hybrid" ? "hybrid" : "streets-v2", maptilerKey);
      mapRef.current.setStyle(style);
      mapRef.current.once("idle", () => {
        void renderHotelMarkers();
        if (mapRef.current) emitBounds(mapRef.current);
      });
    },
    [emitBounds, maptilerKey, renderHotelMarkers],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const style = maptilerKey
        ? maptilerStyleUrl("hybrid", maptilerKey)
        : "https://demotiles.maplibre.org/style.json";

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [centerLng, centerLat],
        zoom: 13,
        attributionControl: false,
        ...(maptilerKey ? { transformRequest: directMaptilerTransformRequest(maptilerKey) } : {}),
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        if (!cancelled) {
          setReady(true);
          emitBounds(map);
        }
      });
      map.on("moveend", () => emitBounds(map));
    })();

    return () => {
      cancelled = true;
      for (const marker of hotelMarkersRef.current) marker.remove();
      for (const marker of transitMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];
      transitMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [centerLat, centerLng, maptilerKey, emitBounds]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/hotels/transit-nearby?lat=${centerLat}&lng=${centerLng}&kind=metro`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { stops: [] }))
      .then((data: { stops?: TransitStop[] }) => {
        if (!cancelled) setMetroStops(Array.isArray(data.stops) ? data.stops : []);
      })
      .catch(() => {
        if (!cancelled) setMetroStops([]);
      });
    return () => {
      cancelled = true;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    void renderHotelMarkers();
  }, [renderHotelMarkers]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      for (const marker of transitMarkersRef.current) marker.remove();
      transitMarkersRef.current = [];

      for (const stop of metroStops) {
        const el = createMetroMarker(stop.name);
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([stop.lng, stop.lat])
          .addTo(mapRef.current!);
        transitMarkersRef.current.push(marker);
      }
    })();

    return () => {
      for (const marker of transitMarkersRef.current) marker.remove();
      transitMarkersRef.current = [];
    };
  }, [ready, metroStops]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-800" /> Best match
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Good fit
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-violet-600" /> M Metro
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyMapStyle("hybrid")}
            className={`rounded-md px-2 py-0.5 font-bold ${mapStyle === "hybrid" ? "bg-sky-600 text-white" : "text-slate-600"}`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => applyMapStyle("streets")}
            className={`rounded-md px-2 py-0.5 font-bold ${mapStyle === "streets" ? "bg-sky-600 text-white" : "text-slate-600"}`}
          >
            Streets
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 md:h-80 lg:h-[28rem]"
      />

      <p className="text-[10px] text-slate-500">
        {city} · {hotels.length} on map · zoom in/out to filter the list · purple <strong>M</strong> = metro / rail
      </p>
    </div>
  );
}
