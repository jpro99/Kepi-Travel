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
  // Ref-based loaded flag so the error handler closure always sees the current value
  const isLoadedRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("Loading map...");
  const [isError, setIsError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Place markers - called ONLY after map fires "load" event, passing the map directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placeMarkers = useCallback((map: any) => {
    import("maplibre-gl").then((ml) => {
      // Remove all existing markers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map._kepiMarkers?.forEach((m: any) => m.remove());
      map._kepiMarkers = [];

      members.forEach(member => {
        const loc = locations[member.id];
        if (!loc) return;

        const stale = isStale(loc.updatedAt);
        const wrap = document.createElement("div");
        wrap.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;";

        const av = document.createElement("div");
        av.style.cssText = [
          `width:46px;height:46px;border-radius:50%;`,
          `background:${stale ? "#64748b" : member.color};`,
          `border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);`,
          `display:flex;align-items:center;justify-content:center;`,
          `font-size:17px;font-weight:800;color:white;`,
          `font-family:system-ui,sans-serif;position:relative;`,
        ].join("");
        av.textContent = member.name.charAt(0).toUpperCase();

        if (!stale) {
          const ring = document.createElement("div");
          ring.style.cssText = [
            `position:absolute;inset:-6px;border-radius:50%;`,
            `border:2px solid ${member.color};`,
            `animation:kpulse 2s ease-out infinite;`,
          ].join("");
          av.appendChild(ring);
        }

        const lbl = document.createElement("div");
        lbl.style.cssText = [
          `background:white;border-radius:6px;padding:2px 7px;`,
          `font-size:11px;font-weight:700;color:#0f172a;`,
          `box-shadow:0 1px 4px rgba(0,0,0,0.15);`,
          `white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;`,
        ].join("");
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
          .addTo(map);

        // Store marker ON the map object so it survives re-renders
        map._kepiMarkers.push(marker);
      });
    }).catch(console.error);
  }, [members, locations, onMemberClick]);

  // Init map effect — depends on maptilerKey so it re-runs when key changes
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;

    let cancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false);
    setIsError(false);
    setStatusMsg("Loading map...");

    // Destroy previous instance
    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current._kepiMarkers?.forEach((m: any) => m.remove());
      mapRef.current.remove();
      mapRef.current = null;
    }

    void (async () => {
      try {
        if (cancelled || !mapEl.current) return;

        const ml = await import("maplibre-gl");
        if (cancelled || !mapEl.current) return;

        const knownLocs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
        const center: [number, number] = knownLocs.length > 0
          ? [
              knownLocs.reduce((s, l) => s + l.lon, 0) / knownLocs.length,
              knownLocs.reduce((s, l) => s + l.lat, 0) / knownLocs.length,
            ]
          : [-118.2437, 34.0522];
        const zoom = knownLocs.length === 1 ? 14 : knownLocs.length > 1 ? 10 : 4;

        // Inline raster style for Streets — tiles load as <img> fetches, no web-worker
        // XHR needed. This is the same mechanism satellite uses. MapTiler serves 512px
        // PNG streets tiles up to zoom 20.
        const key = encodeURIComponent(maptilerKey);
        const streetsRasterStyle = {
          version: 8 as const,
          sources: {
            "streets-raster": {
              type: "raster" as const,
              // @2x tiles = actual 512px PNGs — matches tileSize:512 exactly, no stretching
              tiles: [`https://api.maptiler.com/maps/streets/{z}/{x}/{y}@2x.png?key=${key}`],
              tileSize: 512,
              maxzoom: 20,
              attribution: "© MapTiler © OpenStreetMap contributors",
            },
          },
          layers: [
            {
              id: "streets-raster-layer",
              type: "raster" as const,
              source: "streets-raster",
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = new (ml as any).Map({
          container: mapEl.current,
          style: streetsRasterStyle,
          center,
          zoom,
          maxZoom: 20,
          // Match device pixel ratio so tiles render crisp on retina/high-DPI screens
          pixelRatio: typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1,
          attributionControl: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).NavigationControl({ showCompass: false }), "top-right");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).AttributionControl({ compact: true }), "bottom-right");

        // "style.load" fires when style is parsed — does NOT wait for tiles
        // This is more reliable than "load" which waits for all tiles to render
        map.on("style.load", () => {
          if (cancelled) return;
          isLoadedRef.current = true;
          setIsLoaded(true);
          setIsError(false);
          setStatusMsg("");
          placeMarkers(map);
        });

        // Also handle "load" as a fallback (fires after tiles)
        map.on("load", () => {
          if (cancelled) return;
          isLoadedRef.current = true;
          setIsLoaded(true);
          setIsError(false);
        });

        // Place markers again once map is idle (all tiles loaded/settled)
        map.once("idle", () => {
          if (cancelled) return;
          setIsLoaded(true);
          placeMarkers(map);
        });

        // Show MapLibre errors on screen — BUT only for critical init failures.
        // Tile-level fetch errors (status 0 / AJAXError) after the map has already
        // loaded are transient network blips; showing the overlay would clobber a
        // working map. Only show the overlay if the map hasn't loaded yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on("error", (e: any) => {
          const msg = String(e?.error?.message ?? e?.error?.statusCode ?? e?.message ?? "unknown error");
          console.warn("[FamilyMap]", msg, e);
          // Post-load tile errors (AJAXError / Failed to fetch) are non-fatal — log only
          if (isLoadedRef.current) return;
          if (!cancelled) {
            setIsError(true);
            setStatusMsg(`Map error: ${msg}`);
          }
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) {
          setIsError(true);
          setStatusMsg(`Map failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapRef.current._kepiMarkers?.forEach((m: any) => m.remove());
        mapRef.current.remove();
        mapRef.current = null;
      }
      isLoadedRef.current = false;
      setIsLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]); // re-init ONLY when key changes

  // Re-place markers when locations or members change (after map is loaded)
  useEffect(() => {
    if (mapRef.current && isLoaded) placeMarkers(mapRef.current);
  }, [placeMarkers, isLoaded]);

  // Satellite toggle — both styles are raster so no worker XHR needed
  useEffect(() => {
    if (!mapRef.current || !maptilerKey || !isLoaded) return;
    const key = encodeURIComponent(maptilerKey);
    // Satellite: use MapTiler hybrid style.json (raster, already works)
    // Streets: inline raster style object (same as init — avoids worker XHR)
    // Both styles use @2x raster tiles (actual 512px images, no stretching)
    const satelliteStyle = {
      version: 8 as const,
      sources: {
        "satellite-raster": {
          type: "raster" as const,
          // @2x JPG = 512px satellite tiles — sharp on retina/high-DPI screens
          tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}@2x.jpg?key=${key}`],
          tileSize: 512,
          maxzoom: 20,
          attribution: "© MapTiler © OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "satellite-raster-layer",
          type: "raster" as const,
          source: "satellite-raster",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
    const streetsStyle = {
      version: 8 as const,
      sources: {
        "streets-raster": {
          type: "raster" as const,
          // @2x PNG = 512px street tiles — sharp on retina/high-DPI screens
          tiles: [`https://api.maptiler.com/maps/streets/{z}/{x}/{y}@2x.png?key=${key}`],
          tileSize: 512,
          maxzoom: 20,
          attribution: "© MapTiler © OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "streets-raster-layer",
          type: "raster" as const,
          source: "streets-raster",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
    mapRef.current.setStyle(satellite ? satelliteStyle : streetsStyle);
    mapRef.current.once("styledata", () => {
      if (mapRef.current) placeMarkers(mapRef.current);
    });
  }, [satellite, maptilerKey, placeMarkers, isLoaded]);

  // Resize map on fullscreen change
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 100);
    return () => clearTimeout(t);
  }, [fullscreen]);

  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = members.map(m => locations[m.id]).filter(Boolean) as LocationPoint[];
    if (locs.length === 0) return;
    if (locs.length === 1) {
      mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 14 });
      return;
    }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 14 });
    }).catch(console.error);
  }, [members, locations]);

  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;

  return (
    <>
      <style>{`
        @keyframes kpulse {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.9); opacity: 0; }
        }
      `}</style>

      <div
        className={fullscreen ? "fixed inset-0 z-[9000]" : "relative w-full rounded-2xl overflow-hidden"}
        style={{ height: fullscreen ? "100dvh" : height }}
      >
        {/* Map canvas — always rendered, always full size */}
        <div
          ref={mapEl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

        {/* No spinner overlay — map renders as it loads. Dark bg = tiles loading. */}

        {/* Error overlay — ONLY shown when key is actually rejected */}
        {isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-5 text-center z-10 gap-3">
            <span className="text-3xl">🗺</span>
            <p className="text-sm text-red-300 max-w-xs leading-relaxed">{statusMsg}</p>
            <a
              href="https://cloud.maptiler.com/account/keys"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white"
            >
              Open MapTiler Keys →
            </a>
          </div>
        )}

        {/* Controls — always on top */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
          {maptilerKey && (
            <button
              type="button"
              onClick={() => setSatellite(v => !v)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold shadow-lg ${
                satellite ? "bg-sky-600 text-white" : "bg-white/90 text-slate-800 backdrop-blur"
              }`}
            >
              {satellite ? "🛰 Satellite" : "🗺 Streets"}
            </button>
          )}
          {Object.keys(locations).length > 0 && (
            <button
              type="button"
              onClick={fitAll}
              className="rounded-xl bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg"
            >
              👁 Fit all
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(v => !v)}
            className="rounded-xl bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg"
          >
            {fullscreen ? "✕ Close" : "⛶ Expand"}
          </button>
        </div>

        {/* Selected member info card */}
        {selMember && selLoc && (
          <div className="absolute bottom-3 left-3 right-14 z-20 rounded-2xl bg-white/95 backdrop-blur p-3 shadow-xl dark:bg-slate-900/95">
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: selMember.color }}
              >
                {selMember.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selMember.name}</p>
                <p className="text-xs text-slate-500">
                  {isStale(selLoc.updatedAt)
                    ? `⚠ ${timeAgo(selLoc.updatedAt)} — may be outdated`
                    : `🟢 Live · ${timeAgo(selLoc.updatedAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto shrink-0 text-slate-400 text-lg leading-none"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Spacer when fullscreen so page doesn't collapse */}
      {fullscreen && <div style={{ height: 300 }} />}
    </>
  );
}
