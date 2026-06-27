"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useState } from "react";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

interface HotelStayMapProps {
  city: string;
  centerLat: number;
  centerLng: number;
  hotels: RankedHotelSearchResult[];
  selectedId: string | null;
  onSelect: (hotel: RankedHotelSearchResult) => void;
}

/** Spread pins around city center when exact hotel coords are unavailable. */
function pinForHotel(centerLat: number, centerLng: number, index: number, total: number): { lat: number; lng: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 0.012 + (index % 4) * 0.004;
  return {
    lat: centerLat + Math.sin(angle) * radius,
    lng: centerLng + Math.cos(angle) * radius,
  };
}

export function HotelStayMap({ city, centerLat, centerLng, hotels, selectedId, onSelect }: HotelStayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [centerLng, centerLat],
        zoom: 11,
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
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      hotels.forEach((hotel, index) => {
        const { lat, lng } = pinForHotel(centerLat, centerLng, index, hotels.length);
        const el = document.createElement("button");
        el.type = "button";
        el.className = `flex h-8 w-8 items-center justify-center rounded-full text-xs font-black shadow ${
          selectedId === hotel.id ? "bg-[#f4c95d] text-[#0b1f3a] ring-2 ring-white" : "bg-sky-600 text-white"
        }`;
        el.textContent = String(hotel.rank);
        el.title = hotel.name;
        el.onclick = () => onSelect(hotel);

        const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(mapRef.current!);
        markersRef.current.push(marker);
      });
    })();
  }, [ready, hotels, centerLat, centerLng, selectedId, onSelect]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 md:h-72" />
      <p className="text-[10px] text-slate-500">
        Map pins for {city} are approximate — use rank #{hotels[0]?.rank ?? 1}–#{hotels[hotels.length - 1]?.rank ?? 1} to compare location vs price, then confirm the address before booking.
      </p>
    </div>
  );
}
