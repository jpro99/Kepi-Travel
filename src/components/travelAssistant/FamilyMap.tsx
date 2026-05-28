"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useCallback, useState } from "react";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const [satellite, setSatellite] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<"unchecked" | "valid" | "invalid">("unchecked");
  const [ready, setReady] = useState(false);
  const activeKeyRef = useRef<string>("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createPinEl = useCallback((member: FamilyMember, loc: LocationPoint): HTMLElement => {
    const stale = isStale(loc.updatedAt);
    const wrap = document.createElement("div");
    wrap.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;";
    const av = document.createElement("div");
    av.style.cssText = `width:46px;height:46px;border-radius:50%;background:${stale ? "#64748b" : member.color};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:white;font-family:system-ui,sans-serif;position:relative;`;
    av.textContent = member.name.charAt(0).toUpperCase();
    if (!stale) {
      const ring = document.createElement("div");
      ring.style.cssText = `position:absolute;inset:-6px;border-radius:50%;border:2px solid ${member.color};animation:kpulse 2s ease-out infinite;`;
      av.appendChild(ring);
    }
    const lbl = document.createElement("div");
    lbl.style.cssText = "background:white;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;color:#0f172a;box-shadow:0 1px 4px rgba(0,0,0,0.15);white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;";
    lbl.textContent = member.name;
    wrap.appendChild(av);
    wrap.appendChild(lbl);
    wrap.addEventListener("click", () => {
      setSelected(p => p === member.id ? null : member.id);
      onMemberClick?.(member.id);
    });
    return wrap;
  }, [onMemberClick]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncMarkers = useCallback(async (map: any) => {
    if (!map || !ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ml = await import("maplibre-gl") as any;
    markersRef.current.forEach((m: any) => m.remove());
    markersRef.current.clear();
    members.forEach(member => {
      const loc = locations[member.id];
      if (!loc) return;
      const el = createPinEl(member, loc);
      new ml.Marker({ element: el, anchor: "bottom" })
        .setLngLat([loc.lon, loc.lat])
        .addTo(map);
      markersRef.current.set(member.id, map);
    });
  }, [members, locations, createPinEl, ready]);

  const initMap = useCallback(async (key: string) => {
    const el = mapEl.current;
    if (!el) return;

    // Destroy old map instance if key changed
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setReady(false);
    }

    setMapError(null);
    activeKeyRef.current = key;

    try {
      // Pre-validate key by fetching style.json first (same as working VeniceMapClient)
      const styleUrl = key
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
        : "https://demotiles.maplibre.org/style.json";

      if (key) {
        const check = await fetch(styleUrl, { method: "GET", mode: "cors", cache: "no-store" });
        if (!check.ok) {
          setKeyStatus("invalid");
          setMapError(
            `Map key rejected (HTTP ${check.status}). ` +
            (check.status === 401 || check.status === 403
              ? "Go to cloud.maptiler.com → API Keys → edit key → remove any domain restrictions so kepitravel.com can access it. Then redeploy in Vercel."
              : `Unexpected error from MapTiler.`)
          );
          return;
        }
        setKeyStatus("valid");
      }

      // Key is valid — build the map
      if (activeKeyRef.current !== key) return; // key changed while we were fetching
      if (!mapEl.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ml = await import("maplibre-gl") as any;
      if (activeKeyRef.current !== key || !mapEl.current) return;

      const knownLocs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
      const center: [number, number] = knownLocs.length > 0
        ? [knownLocs.reduce((s, l) => s + l.lon, 0) / knownLocs.length,
           knownLocs.reduce((s, l) => s + l.lat, 0) / knownLocs.length]
        : [-118.2437, 34.0522];
      const zoom = knownLocs.length === 1 ? 14 : knownLocs.length > 1 ? 10 : 4;

      const map = new ml.Map({
        container: mapEl.current,
        style: styleUrl,
        center,
        zoom,
        attributionControl: false,
      });

      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new ml.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        if (activeKeyRef.current === key) {
          setReady(true);
          setMapError(null);
          void syncMarkers(map);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("error", (e: any) => {
        const msg = String(e?.error?.message ?? e?.message ?? "");
        if (msg && !msg.includes("abort") && !msg.includes("cancel")) {
          console.error("[FamilyMap] MapLibre error:", msg);
        }
      });

      mapRef.current = map;
    } catch (err) {
      setMapError(`Map failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [members, locations, syncMarkers]);

  // Re-init map when key changes
  useEffect(() => {
    void initMap(maptilerKey);
    return () => {
      activeKeyRef.current = "";
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setReady(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]); // re-init when key changes

  // Sync markers when locations change
  useEffect(() => {
    if (mapRef.current && ready) void syncMarkers(mapRef.current);
  }, [syncMarkers, ready]);

  // Satellite toggle
  useEffect(() => {
    if (!mapRef.current || !maptilerKey || !ready) return;
    const style = satellite
      ? `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(maptilerKey)}`
      : `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(maptilerKey)}`;
    mapRef.current.setStyle(style);
    mapRef.current.once("styledata", () => {
      if (mapRef.current) void syncMarkers(mapRef.current);
    });
  }, [satellite, maptilerKey, syncMarkers, ready]);

  // Resize when fullscreen changes
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
    if (locs.length === 0) return;
    if (locs.length === 1) { mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 14 }); return; }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 14 });
    }).catch(() => null);
  }, [members, locations]);

  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;
  const mapH = fullscreen ? "100dvh" : height;

  return (
    <>
      <style>{`@keyframes kpulse{0%{transform:scale(0.9);opacity:0.7}100%{transform:scale(1.9);opacity:0}}`}</style>

      <div
        className={fullscreen ? "fixed inset-0 z-[9000]" : "relative w-full"}
        style={{ height: mapH }}
      >
        <div ref={mapEl} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

        {/* Error overlay with actionable message */}
        {mapError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-5 text-center z-10 gap-3">
            <span className="text-3xl">🗺</span>
            <p className="text-sm text-red-300 max-w-xs leading-relaxed">{mapError}</p>
            {keyStatus === "invalid" && (
              <a
                href="https://cloud.maptiler.com/account/keys"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white"
              >
                Open MapTiler Keys →
              </a>
            )}
          </div>
        )}

        {/* Loading state */}
        {!mapError && !ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400">Loading map...</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
          {maptilerKey && keyStatus !== "invalid" && (
            <button
              type="button"
              onClick={() => setSatellite(v => !v)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold shadow-md ${satellite ? "bg-sky-600 text-white" : "bg-white text-slate-800"}`}
            >
              {satellite ? "🛰 Satellite" : "🗺 Streets"}
            </button>
          )}
          {Object.keys(locations).length > 0 && (
            <button type="button" onClick={fitAll} className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md">
              👁 Fit all
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(v => !v)}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md"
          >
            {fullscreen ? "✕ Close" : "⛶ Expand"}
          </button>
        </div>

        {/* Selected member card */}
        {selMember && selLoc && (
          <div className="absolute bottom-3 left-3 right-14 z-10 rounded-2xl bg-white p-3 shadow-xl dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: selMember.color }}>
                {selMember.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selMember.name}</p>
                <p className="text-xs text-slate-500">
                  {isStale(selLoc.updatedAt) ? `⚠ ${timeAgo(selLoc.updatedAt)} — may be outdated` : `🟢 Live · ${timeAgo(selLoc.updatedAt)}`}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="ml-auto shrink-0 text-slate-400 text-lg">✕</button>
            </div>
          </div>
        )}
      </div>

      {fullscreen && <div style={{ height: 300 }} />}
    </>
  );
}
