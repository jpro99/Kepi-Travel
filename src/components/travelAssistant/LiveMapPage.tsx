"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ─────────────────────────────────────────────────── */
interface LocationPoint {
  lat: number;
  lon: number;
  accuracy?: number;
  updatedAt: string;
  memberId: string;
  label?: string;
}

interface FamilyMember {
  id: string;
  name: string;
  email: string | null;
  role: "organizer" | "adult" | "teen" | "child";
  color: string;
  sharingEnabled: boolean;
  visibility: "all-members" | "organizer-only";
  joinedAt: string;
}

interface FamilyGroup {
  id: string;
  name: string;
  ownerId: string;
  members: FamilyMember[];
  inviteCode: string;
  createdAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}
function isStale(iso: string) { return Date.now() - Date.parse(iso) > 10 * 60_000; }

/* ─── Inline raster style builders ──────────────────────────── */
function buildStreetsStyle(key: string) {
  return {
    version: 8 as const,
    sources: {
      "streets-raster": {
        type: "raster" as const,
        tiles: [`https://api.maptiler.com/maps/streets/{z}/{x}/{y}@2x.png?key=${key}`],
        tileSize: 512, maxzoom: 20,
        attribution: "© MapTiler © OpenStreetMap contributors",
      },
    },
    layers: [{ id: "streets-layer", type: "raster" as const, source: "streets-raster", minzoom: 0, maxzoom: 22 }],
  };
}
function buildSatelliteStyle(key: string) {
  return {
    version: 8 as const,
    sources: {
      "sat-raster": {
        type: "raster" as const,
        tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}@2x.jpg?key=${key}`],
        tileSize: 512, maxzoom: 20,
        attribution: "© MapTiler © OpenStreetMap contributors",
      },
    },
    layers: [{ id: "sat-layer", type: "raster" as const, source: "sat-raster", minzoom: 0, maxzoom: 22 }],
  };
}

/* ─── Component ──────────────────────────────────────────────── */
export function LiveMapPage() {
  const router = useRouter();
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const isLoadedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
  const [maptilerKey, setMaptilerKey] = useState("");
  const [satellite, setSatellite] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sharingLocation, setSharingLocation] = useState(false);

  /* ── Load group + config ── */
  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { maptilerKey?: string }) => { if (d.maptilerKey) setMaptilerKey(d.maptilerKey); })
      .catch(() => null);

    void fetch("/api/family", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { group: FamilyGroup; locations: Record<string, LocationPoint> }) => {
        setGroup(d.group);
        setLocations(d.locations ?? {});
      })
      .catch(() => null);
  }, []);

  /* ── Poll locations every 30 s ── */
  useEffect(() => {
    const id = setInterval(() => {
      void fetch("/api/family", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { group?: FamilyGroup; locations?: Record<string, LocationPoint> }) => {
          if (d.locations) setLocations(d.locations);
        })
        .catch(() => null);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Place markers ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placeMarkers = useCallback((map: any) => {
    if (!map) return;
    import("maplibre-gl").then((ml) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map._kepiMarkers?.forEach((m: any) => m.remove());
      map._kepiMarkers = [];

      (group?.members ?? []).forEach(member => {
        const loc = locations[member.id];
        if (!loc) return;
        const stale = isStale(loc.updatedAt);

        const wrap = document.createElement("div");
        wrap.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;";

        // Outer pulse ring (only for live)
        if (!stale) {
          const pulse = document.createElement("div");
          pulse.style.cssText = [
            "position:absolute;width:64px;height:64px;border-radius:50%;",
            `background:${member.color}33;`,
            "animation:lmpulse 2.4s ease-out infinite;",
            "top:50%;left:50%;transform:translate(-50%,-50%);",
          ].join("");
          const wrap2 = document.createElement("div");
          wrap2.style.cssText = "position:relative;width:48px;height:48px;";
          wrap2.appendChild(pulse);

          const av = buildAvatar(member, stale);
          wrap2.appendChild(av);
          wrap.appendChild(wrap2);
        } else {
          wrap.appendChild(buildAvatar(member, stale));
        }

        const lbl = document.createElement("div");
        lbl.style.cssText = [
          "background:rgba(255,255,255,0.96);border-radius:8px;padding:3px 8px;",
          "font-size:11px;font-weight:700;color:#0f172a;",
          "box-shadow:0 2px 8px rgba(0,0,0,0.18);",
          "white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;",
          "font-family:system-ui,sans-serif;letter-spacing:-0.01em;",
        ].join("");
        lbl.textContent = member.name;

        wrap.appendChild(lbl);
        wrap.addEventListener("click", () => {
          setSelected(p => p === member.id ? null : member.id);
          setDrawerOpen(false);
          map.flyTo({ center: [loc.lon, loc.lat], zoom: 16, duration: 900, essential: true });
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = new (ml as any).Marker({ element: wrap, anchor: "bottom" })
          .setLngLat([loc.lon, loc.lat]).addTo(map);
        map._kepiMarkers.push(marker);
      });
    }).catch(console.error);
  }, [group, locations]);

  /* ── Init map ── */
  useEffect(() => {
    if (!maptilerKey || !mapEl.current) return;
    let cancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false); setIsError(false);

    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current._kepiMarkers?.forEach((m: any) => m.remove());
      mapRef.current.remove();
      mapRef.current = null;
    }

    void (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !mapEl.current) return;

        const locs = Object.values(locations);
        const center: [number, number] = locs.length > 0
          ? [locs.reduce((s, l) => s + l.lon, 0) / locs.length, locs.reduce((s, l) => s + l.lat, 0) / locs.length]
          : [-118.2437, 34.0522];
        const zoom = locs.length === 1 ? 14 : locs.length > 1 ? 11 : 4;
        const key = encodeURIComponent(maptilerKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = new (ml as any).Map({
          container: mapEl.current,
          style: satellite ? buildSatelliteStyle(key) : buildStreetsStyle(key),
          center, zoom,
          maxZoom: 20,
          pixelRatio: typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1,
          attributionControl: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).NavigationControl({ showCompass: true }), "top-right");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).AttributionControl({ compact: true }), "bottom-right");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true,
        }), "top-right");

        map.on("style.load", () => {
          if (cancelled) return;
          isLoadedRef.current = true;
          setIsLoaded(true);
          placeMarkers(map);
        });
        map.on("load", () => { if (!cancelled) { isLoadedRef.current = true; setIsLoaded(true); } });
        map.once("idle", () => { if (!cancelled) placeMarkers(map); });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on("error", (e: any) => {
          const msg = String(e?.error?.message ?? "unknown error");
          console.warn("[LiveMap]", msg, e);
          if (!isLoadedRef.current && !cancelled) { setIsError(true); setErrorMsg(msg); }
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) { setIsError(true); setErrorMsg(err instanceof Error ? err.message : String(err)); }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapRef.current._kepiMarkers?.forEach((m: any) => m.remove());
        mapRef.current.remove(); mapRef.current = null;
      }
      isLoadedRef.current = false; setIsLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  /* ── Re-place markers on data change ── */
  useEffect(() => { if (mapRef.current && isLoaded) placeMarkers(mapRef.current); }, [placeMarkers, isLoaded]);

  /* ── Satellite toggle ── */
  useEffect(() => {
    if (!mapRef.current || !maptilerKey || !isLoaded) return;
    const key = encodeURIComponent(maptilerKey);
    mapRef.current.setStyle(satellite ? buildSatelliteStyle(key) : buildStreetsStyle(key));
    mapRef.current.once("styledata", () => { if (mapRef.current) placeMarkers(mapRef.current); });
  }, [satellite, maptilerKey, isLoaded, placeMarkers]);

  /* ── Fit all ── */
  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = Object.values(locations);
    if (!locs.length) return;
    if (locs.length === 1) { mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 15, essential: true }); return; }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 80, maxZoom: 14, duration: 800 });
    }).catch(console.error);
  }, [locations]);

  /* ── Share location ── */
  const shareLocation = useCallback(() => {
    if (sharingLocation) {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      setSharingLocation(false);
      return;
    }
    if (!navigator.geolocation) { alert("Geolocation not supported on this device."); return; }
    setSharingLocation(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        void fetch("/api/family/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        }).catch(() => null);
      },
      () => setSharingLocation(false),
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
  }, [sharingLocation]);

  useEffect(() => () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  /* ── Derived ── */
  const members = group?.members ?? [];
  const liveCount = members.filter(m => locations[m.id] && !isStale(locations[m.id].updatedAt)).length;
  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;

  /* ── Render ── */
  return (
    <>
      <style>{`
        @keyframes lmpulse {
          0%   { transform: translate(-50%,-50%) scale(0.7); opacity: 0.8; }
          100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
        }
        @keyframes lmslideup {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes lmfadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lm-drawer { animation: lmslideup 0.28s cubic-bezier(0.32,0.72,0,1); }
        .lm-card   { animation: lmfadein 0.22s ease; }
        /* Hide MapLibre's default attribution logo on mobile */
        .maplibregl-ctrl-attrib { font-size: 9px !important; opacity: 0.6; }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }
        .maplibregl-ctrl button { width: 38px !important; height: 38px !important; }
      `}</style>

      {/* Full viewport */}
      <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 overflow-hidden">

        {/* ── Map canvas ── */}
        <div ref={mapEl} className="absolute inset-0 w-full h-full" />

        {/* ── Top bar ── */}
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          {/* Gradient scrim */}
          <div className="h-28 bg-gradient-to-b from-black/60 via-black/20 to-transparent" />
        </div>

        {/* Back + title */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white text-lg shadow-lg"
            aria-label="Back"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight tracking-tight drop-shadow">
              {group?.name ?? "Family"}
            </p>
            <p className="text-white/60 text-[11px] leading-tight">
              {liveCount > 0 ? `${liveCount} live · updates every 30s` : "No live locations"}
            </p>
          </div>
          {/* Map style pill */}
          <div className="flex rounded-full overflow-hidden shadow-lg border border-white/10">
            <button
              type="button"
              onClick={() => setSatellite(false)}
              className={`px-3 py-1.5 text-[11px] font-bold transition-all ${!satellite ? "bg-white text-slate-900" : "bg-black/40 backdrop-blur-md text-white/80"}`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setSatellite(true)}
              className={`px-3 py-1.5 text-[11px] font-bold transition-all ${satellite ? "bg-white text-slate-900" : "bg-black/40 backdrop-blur-md text-white/80"}`}
            >
              Satellite
            </button>
          </div>
        </div>

        {/* ── Loading overlay ── */}
        {!isLoaded && !isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <div className="h-8 w-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            <p className="text-white/60 text-xs">Loading map…</p>
          </div>
        )}

        {/* ── Error overlay ── */}
        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
            <span className="text-4xl">🗺</span>
            <p className="text-red-400 text-sm max-w-xs leading-relaxed">{errorMsg}</p>
            <a href="https://cloud.maptiler.com/account/keys" target="_blank" rel="noreferrer"
              className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg">
              Open MapTiler Keys →
            </a>
          </div>
        )}

        {/* ── Fit-all FAB ── */}
        {Object.keys(locations).length > 0 && isLoaded && (
          <button
            type="button"
            onClick={fitAll}
            className="absolute left-4 bottom-[220px] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-md text-white shadow-lg text-base border border-white/10"
            title="Fit all members"
          >
            ⊙
          </button>
        )}

        {/* ── Selected member info card ── */}
        {selMember && selLoc && (
          <div className="lm-card absolute left-4 right-4 z-20 rounded-2xl overflow-hidden shadow-2xl"
            style={{ bottom: drawerOpen ? "228px" : "24px" }}>
            <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold text-white shadow-lg"
                    style={{ background: selMember.color }}>
                    {selMember.name.charAt(0).toUpperCase()}
                  </div>
                  {!isStale(selLoc.updatedAt) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{selMember.name}</p>
                  <p className="text-white/50 text-xs">
                    {isStale(selLoc.updatedAt)
                      ? `⚠ ${timeAgo(selLoc.updatedAt)} — may be outdated`
                      : `🟢 Live · ${timeAgo(selLoc.updatedAt)}`}
                  </p>
                  {selLoc.label && (
                    <p className="text-white/40 text-[11px] mt-0.5 truncate">📍 {selLoc.label}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      mapRef.current?.flyTo({ center: [selLoc.lon, selLoc.lat], zoom: 17, essential: true });
                    }}
                    className="rounded-xl bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white shadow"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/70"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Member drawer ── */}
        <div className={`absolute left-0 right-0 bottom-0 z-20 transition-transform duration-300 ${drawerOpen ? "translate-y-0" : "translate-y-full"}`}>
          {/* Drawer handle */}
          <button
            type="button"
            onClick={() => setDrawerOpen(v => !v)}
            className="w-full flex justify-center pt-2 pb-1 bg-slate-900/95 backdrop-blur-xl"
            aria-label="Toggle member list"
          >
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </button>

          <div className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 lm-drawer">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div>
                <p className="text-white text-sm font-semibold">
                  {group?.name ?? "Family"}
                  {liveCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {liveCount} live
                    </span>
                  )}
                </p>
                <p className="text-white/40 text-[11px] mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
              </div>
              {/* Share location toggle */}
              <button
                type="button"
                onClick={shareLocation}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold shadow transition-all ${
                  sharingLocation
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-sky-600 text-white"
                }`}
              >
                <span>{sharingLocation ? "🟢" : "📍"}</span>
                {sharingLocation ? "Sharing" : "Share me"}
              </button>
            </div>

            {/* Member rows */}
            <div className="overflow-y-auto max-h-[200px] divide-y divide-white/5">
              {members.length === 0 && (
                <div className="px-4 py-6 text-center text-white/30 text-xs">No members yet</div>
              )}
              {members.map(member => {
                const loc = locations[member.id];
                const live = loc && !isStale(loc.updatedAt);
                const isSelected = selected === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      if (loc) {
                        setSelected(member.id);
                        setDrawerOpen(false);
                        mapRef.current?.flyTo({ center: [loc.lon, loc.lat], zoom: 16, duration: 900, essential: true });
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                      isSelected ? "bg-white/8" : "hover:bg-white/5"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: live ? member.color : "#334155" }}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      {live && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{member.name}</p>
                      <p className="text-white/40 text-[11px] truncate">
                        {loc
                          ? live
                            ? `🟢 Live · ${timeAgo(loc.updatedAt)}`
                            : `⚪ ${timeAgo(loc.updatedAt)}`
                          : "No location shared"}
                      </p>
                      {loc?.label && (
                        <p className="text-white/30 text-[10px] truncate">📍 {loc.label}</p>
                      )}
                    </div>

                    {/* Role badge */}
                    <span className="shrink-0 rounded-md bg-white/8 px-2 py-0.5 text-[10px] text-white/40 font-medium capitalize">
                      {member.role}
                    </span>

                    {isSelected && <span className="shrink-0 text-sky-400 text-xs">●</span>}
                  </button>
                );
              })}
            </div>

            {/* Bottom safe area */}
            <div className="h-[env(safe-area-inset-bottom,16px)]" />
          </div>
        </div>

        {/* ── Drawer collapsed toggle button ── */}
        {!drawerOpen && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="absolute right-4 bottom-6 z-20 flex h-10 items-center gap-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-white/10 px-4 shadow-xl text-white text-[11px] font-semibold"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {liveCount} live
          </button>
        )}

      </div>
    </>
  );
}

/* ─── Avatar DOM helper ──────────────────────────────────────── */
function buildAvatar(member: { name: string; color: string }, stale: boolean): HTMLElement {
  const av = document.createElement("div");
  av.style.cssText = [
    "width:48px;height:48px;border-radius:50%;",
    `background:${stale ? "#334155" : member.color};`,
    "border:3px solid rgba(255,255,255,0.95);",
    "box-shadow:0 3px 14px rgba(0,0,0,0.35);",
    "display:flex;align-items:center;justify-content:center;",
    "font-size:18px;font-weight:800;color:white;",
    "font-family:system-ui,sans-serif;",
  ].join("");
  av.textContent = member.name.charAt(0).toUpperCase();
  return av;
}
