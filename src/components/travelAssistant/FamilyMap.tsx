// @ts-nocheck
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { directMaptilerTransformRequest } from "@/lib/map/maptilerClient";

interface LocationPoint {
  lat: number;
  lon: number;
  updatedAt: string;
  memberId: string;
  label?: string;
}

interface FamilyMember {
  id: string;
  name: string;
  color: string;
  sharingEnabled: boolean;
  imageUrl?: string | null;
}

interface FamilyMapProps {
  members: FamilyMember[];
  locations: Record<string, LocationPoint>;
  maptilerKey: string;
  height?: number;
  onMemberClick?: (memberId: string) => void;
}

function isStale(iso: string): boolean {
  return Date.now() - Date.parse(iso) > 10 * 60_000;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

export function FamilyMap({ members, locations, maptilerKey, height = 300, onMemberClick }: FamilyMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Stable style URLs — only recompute when key changes
  const streetsUrl = useMemo(() => `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(maptilerKey)}`, [maptilerKey]);
  const hybridUrl  = useMemo(() => `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(maptilerKey)}`, [maptilerKey]);

  // Place/move markers — update existing ones in place (no flicker)
  const placeMarkers = useCallback((map: unknown) => {
    import("maplibre-gl").then((ml) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: Record<string, any> = (map as any)._kepiMarkers ?? {};

      members.forEach(member => {
        const loc = locations[member.id];
        if (!loc) return;

        const stale = isStale(loc.updatedAt);

        // Animate marker to new position using requestAnimationFrame lerp
        if (existing[member.id]) {
          const marker = existing[member.id];
          const from = marker.getLngLat();
          const to = { lng: loc.lon, lat: loc.lat };
          // Only animate if moved more than ~15m (consumer GPS drifts 10-30m standing still)
          const dLng = Math.abs(to.lng - from.lng);
          const dLat = Math.abs(to.lat - from.lat);
          if (dLng < 0.00015 && dLat < 0.00015) return; // GPS noise, skip
          // Smooth to weighted average — 70% new, 30% current — reduces jump to raw GPS
          const smoothTo = {
            lng: from.lng * 0.3 + to.lng * 0.7,
            lat: from.lat * 0.3 + to.lat * 0.7,
          };
          const duration = 3000;
          const start = performance.now();
          const animate = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
            marker.setLngLat([
              from.lng + (smoothTo.lng - from.lng) * ease,
              from.lat + (smoothTo.lat - from.lat) * ease,
            ]);
            if (t < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          return;
        }

        // Build new marker DOM
        const wrap = document.createElement("div");
        wrap.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;";

        const av = document.createElement("div");
        av.style.cssText = [
          "width:44px;height:44px;border-radius:50%;",
          `border:3px solid ${stale ? "#94a3b8" : member.color};`,
          "box-shadow:0 2px 12px rgba(0,0,0,0.35);overflow:hidden;position:relative;",
          `background:${stale ? "#64748b" : member.color};`,
          "display:flex;align-items:center;justify-content:center;",
        ].join("");

        if (member.imageUrl) {
          const img = document.createElement("img");
          img.src = member.imageUrl;
          img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
          img.onerror = () => {
            img.style.display = "none";
            const span = document.createElement("span");
            span.textContent = member.name.charAt(0).toUpperCase();
            span.style.cssText = "font-size:16px;font-weight:800;color:white;font-family:system-ui,sans-serif;";
            av.appendChild(span);
          };
          av.appendChild(img);
        } else {
          const init = document.createElement("span");
          init.textContent = member.name.charAt(0).toUpperCase();
          init.style.cssText = "font-size:16px;font-weight:800;color:white;font-family:system-ui,sans-serif;";
          av.appendChild(init);
        }

        if (!stale) {
          const ring = document.createElement("div");
          ring.style.cssText = `position:absolute;inset:-7px;border-radius:50%;border:2.5px solid ${member.color};animation:kpulse 2s ease-out infinite;pointer-events:none;`;
          av.appendChild(ring);
        }

        const lbl = document.createElement("div");
        lbl.style.cssText = "background:white;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;color:#0f172a;box-shadow:0 1px 5px rgba(0,0,0,0.18);white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;";
        lbl.textContent = member.name;

        wrap.appendChild(av);
        wrap.appendChild(lbl);
        wrap.addEventListener("click", () => {
          setSelected(p => p === member.id ? null : member.id);
          onMemberClick?.(member.id);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = new (ml as any).Marker({ element: wrap, anchor: "bottom" })
          .setLngLat([loc.lon, loc.lat])
          .addTo(map as Parameters<typeof marker.addTo>[0]);
        existing[member.id] = marker;
      });

      // Remove markers for members no longer present
      Object.keys(existing).forEach(id => {
        if (!members.find(m => m.id === id)) {
          existing[id].remove();
          delete existing[id];
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._kepiMarkers = existing;
    }).catch(console.error);
  }, [members, locations, onMemberClick]);

  // Init map — only when maptilerKey first arrives
  useEffect(() => {
    const el = mapEl.current;
    if (!el || !maptilerKey) return;
    let cancelled = false;

    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const old = mapRef.current._kepiMarkers as Record<string, any> | undefined;
      if (old) Object.values(old).forEach((m: unknown) => (m as { remove(): void }).remove());
      mapRef.current.remove();
      mapRef.current = null;
      setIsLoaded(false);
    }

    void (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !mapEl.current) return;

      const knownLocs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
      const center: [number, number] = knownLocs.length > 0
        ? [knownLocs.reduce((s, l) => s + l.lon, 0) / knownLocs.length, knownLocs.reduce((s, l) => s + l.lat, 0) / knownLocs.length]
        : [-118.2437, 34.0522];
      const zoom = knownLocs.length === 1 ? 14 : knownLocs.length > 1 ? 10 : 4;

      const styleUrl = streetsUrl;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = new (ml as any).Map({
        container: mapEl.current,
        style: styleUrl,
        center, zoom,
        attributionControl: false,
        fadeDuration: 0,
        transformRequest: directMaptilerTransformRequest(maptilerKey),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addControl(new (ml as any).NavigationControl({ showCompass: false }), "top-right");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addControl(new (ml as any).AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        if (cancelled) return;
        setIsLoaded(true);
        placeMarkers(map);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("error", (e: any) => { console.warn("[FamilyMap]", e?.error?.message ?? e?.message); });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const old = mapRef.current._kepiMarkers as Record<string, any> | undefined;
        if (old) Object.values(old).forEach((m: unknown) => (m as { remove(): void }).remove());
        mapRef.current.remove(); mapRef.current = null;
      }
      setIsLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  // Move/place markers when locations or members update
  useEffect(() => {
    if (mapRef.current && isLoaded) placeMarkers(mapRef.current);
  }, [placeMarkers, isLoaded]);

  // Toggle satellite — swap style without reinitialising
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    mapRef.current.setStyle(satellite ? hybridUrl : streetsUrl);
    mapRef.current.once("styledata", () => { if (mapRef.current) placeMarkers(mapRef.current); });
  }, [satellite, hybridUrl, streetsUrl, isLoaded, placeMarkers]);

  // Resize after fullscreen transition
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 120);
    return () => clearTimeout(t);
  }, [fullscreen]);

  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
    if (!locs.length) return;
    if (locs.length === 1) { mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 14, duration: 1500, essential: true }); return; }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 14, duration: 1500 });
    }).catch(console.error);
  }, [members, locations]);

  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;

  return (
    <>
      <style>{`@keyframes kpulse{0%{transform:scale(0.9);opacity:0.7}100%{transform:scale(1.9);opacity:0}}`}</style>
      <div
        className={fullscreen ? "fixed inset-0 z-[9000]" : "relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700"}
        style={{ height: fullscreen ? "100dvh" : height }}
      >
        <div ref={mapEl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

        {/* Controls */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
          <button type="button" onClick={() => setSatellite(v => !v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold shadow-lg ${satellite ? "bg-sky-600 text-white" : "bg-white/90 text-slate-800"}`}>
            {satellite ? "🛰 Satellite" : "🗺 Streets"}
          </button>
          {Object.keys(locations).length > 0 && (
            <button type="button" onClick={fitAll}
              className="rounded-xl bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg">
              👁 Fit all
            </button>
          )}
          <button type="button" onClick={() => setFullscreen(v => !v)}
            className="rounded-xl bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg">
            {fullscreen ? "✕ Close" : "⛶ Expand"}
          </button>
        </div>

        {/* Member tap bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-2 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {members.map(m => {
              const loc = locations[m.id];
              const stale = loc ? isStale(loc.updatedAt) : true;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelected(p => p === m.id ? null : m.id);
                    if (loc && mapRef.current) mapRef.current.flyTo({ center: [loc.lon, loc.lat], zoom: 16, duration: 1200 });
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
                    selected === m.id ? "bg-sky-600 text-white" : "bg-white/90 text-slate-800"
                  }`}
                >
                  <div className="h-5 w-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: m.color }}>
                    {m.imageUrl
                      ? <img src={m.imageUrl} className="w-full h-full object-cover" alt={m.name} />
                      : m.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <span className="truncate max-w-[60px]">{m.name}</span>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${!loc ? "bg-slate-300" : stale ? "bg-amber-400" : "bg-emerald-400"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected member card */}
        {selMember && selLoc && (
          <div className="absolute top-3 right-3 z-20 rounded-2xl bg-white/95 p-3 shadow-xl dark:bg-slate-900/95 w-[220px]">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border-2 flex items-center justify-center font-bold text-white text-sm"
                style={{ background: selMember.color, borderColor: selMember.color }}>
                {selMember.imageUrl
                  ? <img src={selMember.imageUrl} className="w-full h-full object-cover" alt={selMember.name} />
                  : selMember.name.charAt(0).toUpperCase()
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{selMember.name}</p>
                <p className="text-xs text-slate-500">
                  {isStale(selLoc.updatedAt) ? `⚠ ${timeAgo(selLoc.updatedAt)}` : `🟢 ${timeAgo(selLoc.updatedAt)}`}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-400 text-base shrink-0">✕</button>
            </div>
          </div>
        )}
      </div>
      {fullscreen && <div style={{ height: 300 }} />}
    </>
  );
}
