"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitScoreRange, hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

interface HotelStayMapProps {
  city: string;
  centerLat: number;
  centerLng: number;
  hotels: RankedHotelSearchResult[];
  selectedId: string | null;
  onSelect: (hotel: RankedHotelSearchResult) => void;
  compact?: boolean;
}

function pinForHotel(centerLat: number, centerLng: number, index: number, total: number): { lat: number; lng: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 0.008 + (index % 5) * 0.003;
  return {
    lat: centerLat + Math.sin(angle) * radius,
    lng: centerLng + Math.cos(angle) * radius,
  };
}

function createPricePin(hotel: RankedHotelSearchResult, selected: boolean, style: ReturnType<typeof hotelMapPinStyle>): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.title = `${hotel.name} · $${Math.round(hotel.pricePerNight)}/night`;
  el.className = "flex flex-col items-center border-0 bg-transparent p-0";

  const badge = document.createElement("span");
  badge.className = `rounded-lg px-1.5 py-0.5 text-[10px] font-black shadow-md ${
    selected ? "ring-2 ring-white scale-110" : ""
  }`;
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

export function HotelStayMap({
  city,
  centerLat,
  centerLng,
  hotels,
  selectedId,
  onSelect,
  compact = false,
}: HotelStayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const hotelMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [ready, setReady] = useState(false);

  const scoreRange = useMemo(() => fitScoreRange(hotels), [hotels]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [centerLng, centerLat],
        zoom: 12,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      for (const marker of hotelMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLng]);

  const renderHotelMarkers = useCallback(async () => {
    if (!ready || !mapRef.current) return;
    const maplibregl = await import("maplibre-gl");
    for (const marker of hotelMarkersRef.current) marker.remove();
    hotelMarkersRef.current = [];

    hotels.forEach((hotel, index) => {
      const { lat, lng } = pinForHotel(centerLat, centerLng, index, hotels.length);
      const style = hotelMapPinStyle(hotel, scoreRange);
      const el = createPricePin(hotel, selectedId === hotel.id, style);
      el.onclick = () => onSelect(hotel);

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(mapRef.current!);
      hotelMarkersRef.current.push(marker);
    });
  }, [ready, hotels, centerLat, centerLng, selectedId, onSelect, scoreRange]);

  useEffect(() => {
    void renderHotelMarkers();
  }, [renderHotelMarkers]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900/50">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-800" /> Best match
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Good fit
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-600" /> Higher / less match
        </span>
        <span className="text-slate-400">{city} · {hotels.length} hotels</span>
      </div>

      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 ${
          compact ? "h-48 md:h-56" : "h-56 md:h-72 lg:h-80"
        }`}
      />
    </div>
  );
}
