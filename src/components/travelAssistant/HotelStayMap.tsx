"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TransitStop } from "@/lib/hotels/nearbyTransit";
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
    "mt-0.5 max-w-[4.5rem] truncate rounded bg-violet-950/85 px-1 py-0.5 text-[8px] font-semibold text-violet-100 opacity-0 group-hover:opacity-100 group-focus:opacity-100";
  label.textContent = name;

  wrap.append(badge, label);
  return wrap;
}

function createBusMarker(name: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.title = name;
  el.className =
    "flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white shadow ring-1 ring-white";
  el.textContent = "B";
  return el;
}

export function HotelStayMap({ city, centerLat, centerLng, hotels, selectedId, onSelect }: HotelStayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const hotelMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const transitMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [showBuses, setShowBuses] = useState(false);
  const [metroStops, setMetroStops] = useState<TransitStop[]>([]);
  const [busStops, setBusStops] = useState<TransitStop[]>([]);
  const [transitLoading, setTransitLoading] = useState(false);

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
      for (const marker of hotelMarkersRef.current) marker.remove();
      for (const marker of transitMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];
      transitMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    let cancelled = false;
    setTransitLoading(true);
    void fetch(`/api/hotels/transit-nearby?lat=${centerLat}&lng=${centerLng}&kind=metro`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { stops: [] }))
      .then((data: { stops?: TransitStop[] }) => {
        if (!cancelled) setMetroStops(Array.isArray(data.stops) ? data.stops : []);
      })
      .catch(() => {
        if (!cancelled) setMetroStops([]);
      })
      .finally(() => {
        if (!cancelled) setTransitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    if (!showBuses) {
      setBusStops([]);
      return;
    }
    let cancelled = false;
    setTransitLoading(true);
    void fetch(`/api/hotels/transit-nearby?lat=${centerLat}&lng=${centerLng}&kind=bus`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { stops: [] }))
      .then((data: { stops?: TransitStop[] }) => {
        if (!cancelled) setBusStops(Array.isArray(data.stops) ? data.stops : []);
      })
      .catch(() => {
        if (!cancelled) setBusStops([]);
      })
      .finally(() => {
        if (!cancelled) setTransitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showBuses, centerLat, centerLng]);

  const renderTransitMarkers = useCallback(
    async (stops: TransitStop[], kind: "metro" | "bus") => {
      if (!mapRef.current) return;
      const maplibregl = await import("maplibre-gl");
      const next: import("maplibre-gl").Marker[] = [];

      for (const stop of stops) {
        const el = kind === "metro" ? createMetroMarker(stop.name) : createBusMarker(stop.name);
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([stop.lng, stop.lat])
          .addTo(mapRef.current);
        next.push(marker);
      }
      return next;
    },
    [],
  );

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      for (const marker of hotelMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];

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
        hotelMarkersRef.current.push(marker);
      });
    })();
  }, [ready, hotels, centerLat, centerLng, selectedId, onSelect]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      for (const marker of transitMarkersRef.current) marker.remove();
      transitMarkersRef.current = [];

      const metroMarkers = (await renderTransitMarkers(metroStops, "metro")) ?? [];
      if (cancelled) {
        for (const marker of metroMarkers) marker.remove();
        return;
      }
      transitMarkersRef.current.push(...metroMarkers);

      if (showBuses) {
        const busMarkers = (await renderTransitMarkers(busStops, "bus")) ?? [];
        if (cancelled) {
          for (const marker of busMarkers) marker.remove();
          return;
        }
        transitMarkersRef.current.push(...busMarkers);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, metroStops, busStops, showBuses, renderTransitMarkers]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[9px] font-black text-white">
              M
            </span>
            Metro / rail
          </span>
          <span className="text-slate-400">·</span>
          <span>
            {transitLoading && metroStops.length === 0 ? "Loading transit…" : `${metroStops.length} stations`}
          </span>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          <span className="inline-flex items-center gap-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white">
              B
            </span>
            Bus stops
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showBuses}
            onClick={() => setShowBuses((value) => !value)}
            className={`relative h-6 w-11 rounded-full transition ${showBuses ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${showBuses ? "left-5" : "left-0.5"}`}
            />
          </button>
        </label>
      </div>

      <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 md:h-72" />

      <p className="text-[10px] text-slate-500">
        Purple <strong>M</strong> = metro / rail (always shown). Toggle <strong>Bus stops</strong> for local buses.
        Hotel ranks #{hotels[0]?.rank ?? 1}–#{hotels[hotels.length - 1]?.rank ?? 1} are approximate — confirm addresses
        before booking. Transit from OpenStreetMap.
      </p>
    </div>
  );
}
