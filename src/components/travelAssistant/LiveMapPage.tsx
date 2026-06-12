"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AirportNavigatorMap } from "@/components/travelAssistant/AirportNavigatorMap";
import {
  deriveEligibleLounges,
  useActiveFlight,
  useNavigatorCredentials,
} from "@/lib/travelAssistant/useActiveFlight";
import { getAirportProximity } from "@/lib/travelAssistant/airportGeo";
import {
  ensureDefaultFamilySharingOn,
  isFamilySharingOptedOut,
  setFamilySharingOptedOut,
} from "@/lib/family/locationSharingPrefs";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";

/* ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
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

/* ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}
function isStale(iso: string) { return Date.now() - Date.parse(iso) > 10 * 60_000; }

/* ─── Map style builders ─── */
type MapStyleId = "dark" | "streets" | "satellite";
function styleUrlFor(styleId: MapStyleId, key: string): string {
  if (styleId === "satellite") return maptilerStyleUrl("satellite", key);
  if (styleId === "streets") return maptilerStyleUrl("streets-v2", key);
  return maptilerStyleUrl("dataviz-dark", key);
}

/* ΓöÇΓöÇΓöÇ Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
export function LiveMapPage() {
  const router = useRouter();
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const isLoadedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const myMemberIdRef = useRef<string | null>(null);
  const firstFixRef = useRef<boolean>(false);

  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
  const [maptilerKey, setMaptilerKey] = useState("");
  const [mapStyle, setMapStyle] = useState<MapStyleId>("dark");
  const [headingUp, setHeadingUp] = useState(false); // rotate map to match phone direction
  const headingRef = useRef<number>(0); // current compass heading in degrees
  const headingWatchRef = useRef<(() => void) | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  /* ΓöÇΓöÇ Load group + config ΓöÇΓöÇ */
  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { maptilerKey?: string }) => { if (d.maptilerKey) setMaptilerKey(d.maptilerKey); })
      .catch(() => null);

    void fetch("/api/family", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { group: FamilyGroup; locations: Record<string, LocationPoint>; myMemberId?: string }) => {
        setGroup(d.group);
        setLocations(d.locations ?? {});
        if (d.myMemberId) {
          setMyMemberId(d.myMemberId);
          myMemberIdRef.current = d.myMemberId;
        }
      })
      .catch(() => null);
  }, []);

  /* ΓöÇΓöÇ Poll locations every 10 s (faster than before) ΓöÇΓöÇ */
  useEffect(() => {
    const id = setInterval(() => {
      void fetch("/api/family", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { locations?: Record<string, LocationPoint> }) => {
          if (d.locations) setLocations(d.locations);
        })
        .catch(() => null);
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  /* ΓöÇΓöÇ Place/update markers (move existing ones, no full rebuild) ΓöÇΓöÇ */
  const placeMarkers = useCallback((map: unknown) => {
    if (!map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any;
    import("maplibre-gl").then((ml) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: Record<string, any> = m._kepiMarkers ?? {};

      (group?.members ?? []).forEach(member => {
        const loc = locations[member.id];
        if (!loc) return;
        const stale = isStale(loc.updatedAt);

        if (existing[member.id]) {
          const marker = existing[member.id];
          const from = marker.getLngLat();
          // GPS noise filter ΓÇö skip if moved less than ~15 metres
          // Consumer GPS drifts 10-30m even when standing still
          const dLng = Math.abs(loc.lon - from.lng);
          const dLat = Math.abs(loc.lat - from.lat);
          if (dLng < 0.00015 && dLat < 0.00015) return;
          // Smooth to a weighted average of current position and new reading
          // This prevents jumping to raw GPS coordinates (which are noisy)
          // Weight: 70% new reading, 30% current ΓÇö smooths noise but stays accurate
          const to = {
            lng: from.lng * 0.3 + loc.lon * 0.7,
            lat: from.lat * 0.3 + loc.lat * 0.7,
          };
          const dur = 3000; // slower animation = less jumpy appearance
          const t0 = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const e = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
            marker.setLngLat([from.lng+(to.lng-from.lng)*e, from.lat+(to.lat-from.lat)*e]);
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          return;
        }

        // Build new marker
        const isMyMarker = member.id === myMemberIdRef.current;
        const wrap = document.createElement("div");
        wrap.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;";

        // Direction cone ΓÇö only on my marker, shows which way phone is pointing
        if (isMyMarker) {
          const cone = document.createElement("div");
          cone.id = `kepi-cone-${member.id}`;
          cone.style.cssText = [
            "position:absolute;width:0;height:0;",
            "border-left:10px solid transparent;",
            "border-right:10px solid transparent;",
            `border-bottom:22px solid ${member.color};`,
            "opacity:0.85;",
            "top:-26px;left:50%;transform:translateX(-50%);",
            `transform-origin:center 26px;`,
          ].join("");
          // Rotate cone to current heading
          const updateCone = () => {
            cone.style.transform = `translateX(-50%) rotate(${headingRef.current}deg)`;
          };
          // Update cone every 500ms when heading changes
          const coneInterval = setInterval(updateCone, 500);
          updateCone();
          // Store interval cleanup on the element
          (cone as HTMLDivElement & { _interval?: ReturnType<typeof setInterval> })._interval = coneInterval;
          wrap.style.position = "relative";
          wrap.appendChild(cone);
        }

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
          wrap2.appendChild(buildAvatar(member, stale));
          wrap.appendChild(wrap2);
        } else {
          wrap.appendChild(buildAvatar(member, stale));
        }

        // Frosted name chip with live/stale dot ΓÇö readable on dark and satellite
        const lbl = document.createElement("div");
        lbl.style.cssText = [
          "display:flex;align-items:center;gap:4px;",
          "background:rgba(10,16,28,0.72);border:1px solid rgba(255,255,255,0.14);",
          "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);",
          "border-radius:9999px;padding:3px 9px;",
          "font-size:11px;font-weight:700;color:#f8fafc;",
          "box-shadow:0 3px 10px rgba(0,0,0,0.35);",
          "white-space:nowrap;max-width:104px;overflow:hidden;text-overflow:ellipsis;",
          "font-family:system-ui,sans-serif;letter-spacing:-0.01em;",
        ].join("");
        const liveDot = document.createElement("span");
        liveDot.style.cssText = `width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${stale ? "#64748b" : "#34d399"};${stale ? "" : "box-shadow:0 0 6px rgba(52,211,153,0.9);"}`;
        lbl.appendChild(liveDot);
        lbl.appendChild(document.createTextNode(member.name));
        wrap.appendChild(lbl);

        wrap.addEventListener("click", () => {
          setSelected(p => p === member.id ? null : member.id);
          setDrawerOpen(false);
          m.flyTo({ center: [loc.lon, loc.lat], zoom: 16, duration: 900, essential: true });
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = new (ml as any).Marker({ element: wrap, anchor: "bottom" })
          .setLngLat([loc.lon, loc.lat]).addTo(m);
        existing[member.id] = marker;
      });

      // Remove markers for members no longer in group
      Object.keys(existing).forEach(id => {
        if (!(group?.members ?? []).find(mb => mb.id === id)) {
          existing[id].remove();
          delete existing[id];
        }
      });

      m._kepiMarkers = existing;
    }).catch(console.error);
  }, [group, locations]);

  /* ΓöÇΓöÇ Init map (only when maptilerKey first arrives) ΓöÇΓöÇ */
  useEffect(() => {
    if (!maptilerKey || !mapEl.current) return;
    let cancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false); setIsError(false);

    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const old = mapRef.current._kepiMarkers as Record<string, any> | undefined;
      if (old) Object.values(old).forEach((mk: unknown) => (mk as { remove(): void }).remove());
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
        const styleUrl = styleUrlFor(mapStyle, maptilerKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = new (ml as any).Map({
          container: mapEl.current,
          style: styleUrl,
          center, zoom,
          maxZoom: 20,
          attributionControl: false,
          transformRequest: directMaptilerTransformRequest(maptilerKey),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).NavigationControl({ showCompass: true }), "top-right");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).AttributionControl({ compact: true }), "bottom-right");

        map.on("load", () => {
          if (cancelled) return;
          isLoadedRef.current = true;
          setIsLoaded(true);
          placeMarkers(map);
        });
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
        const old = mapRef.current._kepiMarkers as Record<string, any> | undefined;
        if (old) Object.values(old).forEach((mk: unknown) => (mk as { remove(): void }).remove());
        mapRef.current.remove(); mapRef.current = null;
      }
      isLoadedRef.current = false; setIsLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  /* ΓöÇΓöÇ Re-place/move markers when locations update ΓöÇΓöÇ */
  useEffect(() => {
    if (mapRef.current && isLoaded) placeMarkers(mapRef.current);
  }, [placeMarkers, isLoaded]);

  /* ΓöÇΓöÇ Satellite toggle ΓÇö swap style without reinitialising map ΓöÇΓöÇ */
  useEffect(() => {
    if (!mapRef.current || !maptilerKey || !isLoaded) return;
    mapRef.current.setStyle(styleUrlFor(mapStyle, maptilerKey));
    mapRef.current.once("styledata", () => { if (mapRef.current) placeMarkers(mapRef.current); });
  }, [mapStyle, maptilerKey, isLoaded, placeMarkers]);

  /* ΓöÇΓöÇ Fit all members ΓöÇΓöÇ */
  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = Object.values(locations);
    if (!locs.length) return;
    if (locs.length === 1) {
      mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 15, essential: true });
      return;
    }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 80, maxZoom: 14, duration: 800 });
    }).catch(console.error);
  }, [locations]);

  /* ΓöÇΓöÇ Airport Navigator integration (shared selection ΓÇö Map button asks
        the SAME question AirportMode does, via useActiveFlight) ΓöÇΓöÇ */
  const { activeFlight } = useActiveFlight();
  const { credentials: navCredentials, profile: navProfile, saveCredentials } = useNavigatorCredentials();
  const [mapView, setMapView] = useState<"family" | "airport">("family");
  const [navLat, setNavLat] = useState<number | null>(null);
  const [navLon, setNavLon] = useState<number | null>(null);
  const navWatchRef = useRef<number | null>(null);
  const autoAirportRef = useRef(false);

  // Passive low-accuracy watch for proximity + indoor snapping (separate from
  // the consent-gated family location SHARING ΓÇö this never leaves the device)
  useEffect(() => {
    if (!activeFlight || !navigator.geolocation) return;
    navWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setNavLat(pos.coords.latitude);
        setNavLon(pos.coords.longitude);
      },
      () => null,
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => {
      if (navWatchRef.current !== null) navigator.geolocation.clearWatch(navWatchRef.current);
      navWatchRef.current = null;
    };
  }, [activeFlight]);

  const navProximity = useMemo(
    () => getAirportProximity(navLat, navLon, activeFlight?.f.flightDepartureAirport),
    [navLat, navLon, activeFlight],
  );

  // Auto-default to the airport view ONCE when you're actually at the airport
  useEffect(() => {
    if (autoAirportRef.current || !activeFlight) return;
    if (navProximity.status === "at-airport" || navProximity.status === "in-terminal") {
      autoAirportRef.current = true;
      setMapView("airport");
    }
  }, [navProximity.status, activeFlight]);

  const navEligibleLounges = useMemo(
    () =>
      activeFlight
        ? deriveEligibleLounges(
            navProfile,
            activeFlight.f.flightAirline ?? activeFlight.f.provider ?? "",
            activeFlight.f.flightDepartureAirport ?? "",
          )
        : [],
    [navProfile, activeFlight],
  );

  const navMinutesToDeparture = activeFlight ? (activeFlight.utcMs - Date.now()) / 60_000 : 0;

  /* ΓöÇΓöÇ Share my location ΓöÇΓöÇ */
  const shareLocation = useCallback(() => {
    if (sharingLocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      firstFixRef.current = false;
      setSharingLocation(false);
      return;
    }
    if (!navigator.geolocation) { alert("Geolocation not supported on this device."); return; }
    setSharingLocation(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;

        // FIX: correct endpoint is POST /api/family with action:"update-location"
        void fetch("/api/family", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-location", lat, lon, accuracy }),
        }).catch(() => null);

        // FIX: update own pin immediately without waiting for next poll
        const memberId = myMemberIdRef.current;
        if (memberId) {
          setLocations(prev => ({
            ...prev,
            [memberId]: { lat, lon, accuracy, updatedAt: new Date().toISOString(), memberId },
          }));
          // Only center map on first GPS fix, not every update (prevents jumpiness)
          if (mapRef.current && !firstFixRef.current) {
            firstFixRef.current = true;
            mapRef.current.easeTo({ center: [lon, lat], zoom: 15, duration: 1200 });
          }
        }
      },
      () => setSharingLocation(false),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10_000 }
    );
  }, [sharingLocation]);

  useEffect(() => {
    ensureDefaultFamilySharingOn();
    if (!isFamilySharingOptedOut()) shareLocation();
    // Auto-start family sharing unless the user opted out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  /* ΓöÇΓöÇ Derived ΓöÇΓöÇ */
  const members = group?.members ?? [];
  const liveCount = members.filter(m => locations[m.id] && !isStale(locations[m.id].updatedAt)).length;
  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;

  /* ΓöÇΓöÇ Render ΓöÇΓöÇ */
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
        .maplibregl-ctrl-attrib { font-size: 9px !important; opacity: 0.6; }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }
        .maplibregl-ctrl button { width: 38px !important; height: 38px !important; }
      `}</style>

      <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 overflow-hidden">

        {/* Map canvas */}
        <div ref={mapEl} className="absolute inset-0 w-full h-full" />

        {/* Airport Navigator overlay ΓÇö full-bleed when at the airport view */}
        {mapView === "airport" && activeFlight && (
          <div className="absolute inset-0 z-40">
            <AirportNavigatorMap
              fill
              iata={activeFlight.f.flightDepartureAirport ?? ""}
              gateCode={activeFlight.f.flightDepartureGate ?? null}
              airlineName={activeFlight.f.flightAirline ?? activeFlight.f.provider ?? null}
              flightNumber={activeFlight.f.flightNumber ?? null}
              arrivalAirport={activeFlight.f.flightArrivalAirport ?? null}
              departureTerminal={activeFlight.f.flightDepartureTerminal ?? null}
              flightStatusLabel={
                (activeFlight.f.flightDelayMinutes ?? 0) > 0
                  ? `Delayed +${activeFlight.f.flightDelayMinutes}m`
                  : activeFlight.f.flightStatus ?? (activeFlight.f.flightOnTime === false ? "Delayed" : "On time")
              }
              flightDelayed={(activeFlight.f.flightDelayMinutes ?? 0) > 0 || activeFlight.f.flightOnTime === false}
              proximityStatus={navProximity.status}
              minutesToDeparture={navMinutesToDeparture}
              userLat={navLat}
              userLon={navLon}
              credentials={navCredentials}
              onCredentialsAnswer={saveCredentials}
              eligibleLoungeNames={navEligibleLounges}
            />
          </div>
        )}

        {/* Airport Γçä Family view pill ΓÇö only when a flight is in the window */}
        {activeFlight && (
          <div
            className="absolute left-1/2 z-50 flex -translate-x-1/2 overflow-hidden rounded-full border border-white/15 shadow-xl"
            style={{ top: "max(3.6rem, calc(env(safe-area-inset-top) + 3.1rem))" }}
          >
            {([["airport", "Γ£ê Airport"], ["family", "≡ƒæ¬ Family"]] as ["airport" | "family", string][]).map(([viewId, viewLabel]) => (
              <button
                key={viewId}
                type="button"
                onClick={() => setMapView(viewId)}
                className={`px-3.5 py-1.5 text-[11px] font-bold backdrop-blur-md transition-all ${
                  mapView === viewId ? "bg-white text-slate-900" : "bg-black/45 text-white/85"
                }`}
              >
                {viewLabel}
              </button>
            ))}
          </div>
        )}

        {/* Top scrim */}
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className="h-28 bg-gradient-to-b from-black/60 via-black/20 to-transparent" />
        </div>

        {/* Back + title + style toggle */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white text-lg shadow-lg"
            aria-label="Back"
          >
            ΓåÉ
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight tracking-tight drop-shadow">
              {group?.name ?? "Family"}
            </p>
            <p className="text-white/60 text-[11px] leading-tight">
              {liveCount > 0 ? `${liveCount} live ┬╖ updates every 10s` : "No live locations"}
            </p>
          </div>
          <div className="flex rounded-full overflow-hidden shadow-lg border border-white/10">
            {([["dark", "Dark"], ["streets", "Map"], ["satellite", "Sat"]] as [MapStyleId, string][]).map(([styleId, styleLabel]) => (
              <button
                key={styleId}
                type="button"
                onClick={() => setMapStyle(styleId)}
                className={`px-2.5 py-1.5 text-[11px] font-bold transition-all ${mapStyle === styleId ? "bg-white text-slate-900" : "bg-black/40 backdrop-blur-md text-white/80"}`}
              >
                {styleLabel}
              </button>
            ))}
          </div>
          {/* Heading-up toggle */}
          <button
            type="button"
            onClick={() => setHeadingUp(v => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-full shadow-lg text-base transition-all ${
              headingUp
                ? "bg-[#007AFF] text-white shadow-blue-500/40"
                : "bg-black/40 backdrop-blur-md text-white/80"
            }`}
            title={headingUp ? "Heading up (tap for north up)" : "North up (tap for heading up)"}
          >
            {headingUp ? "≡ƒº¡" : "Γ¼å∩╕Å"}
          </button>
        </div>

        {/* Loading overlay */}
        {!isLoaded && !isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <div className="h-8 w-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            <p className="text-white/60 text-xs">Loading mapΓÇª</p>
          </div>
        )}

        {/* Error overlay */}
        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
            <span className="text-4xl">≡ƒù║</span>
            <p className="text-red-400 text-sm max-w-xs leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Fit-all FAB */}
        {Object.keys(locations).length > 0 && isLoaded && (
          <button
            type="button"
            onClick={fitAll}
            className="absolute left-4 bottom-[220px] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-md text-white shadow-lg text-base border border-white/10"
            title="Fit all members"
          >
            ΓèÖ
          </button>
        )}

        {/* Selected member card */}
        {selMember && selLoc && (
          <div
            className="lm-card absolute left-4 right-4 z-20 rounded-2xl overflow-hidden shadow-2xl"
            style={{ bottom: drawerOpen ? "228px" : "24px" }}
          >
            <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold text-white shadow-lg"
                    style={{ background: selMember.color }}
                  >
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
                      ? `ΓÜá ${timeAgo(selLoc.updatedAt)} ΓÇö may be outdated`
                      : `≡ƒƒó Live ┬╖ ${timeAgo(selLoc.updatedAt)}`}
                  </p>
                  {selLoc.label && (
                    <p className="text-white/40 text-[11px] mt-0.5 truncate">≡ƒôì {selLoc.label}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => mapRef.current?.flyTo({ center: [selLoc.lon, selLoc.lat], zoom: 17, essential: true })}
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

        {/* Member drawer */}
        <div className={`absolute left-0 right-0 bottom-0 z-20 transition-transform duration-300 ${drawerOpen ? "translate-y-0" : "translate-y-full"}`}>
          <button
            type="button"
            onClick={() => setDrawerOpen(v => !v)}
            className="w-full flex justify-center pt-2 pb-1 bg-slate-900/95 backdrop-blur-xl"
            aria-label="Toggle member list"
          >
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </button>

          <div className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 lm-drawer">
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
              <button
                type="button"
                onClick={shareLocation}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold shadow transition-all ${
                  sharingLocation
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-sky-600 text-white"
                }`}
              >
                <span>{sharingLocation ? "≡ƒƒó" : "≡ƒôì"}</span>
                {sharingLocation ? "Sharing" : "Share me"}
              </button>
            </div>

            <div className="overflow-y-auto max-h-[200px] divide-y divide-white/5">
              {members.length === 0 && (
                <div className="px-4 py-6 text-center text-white/30 text-xs">No members yet</div>
              )}
              {members.map(member => {
                const loc = locations[member.id];
                const live = loc && !isStale(loc.updatedAt);
                const isMe = member.id === myMemberId;
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
                    <div className="relative shrink-0">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: live ? member.color : "#334155" }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      {live && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {member.name}{isMe ? " (you)" : ""}
                      </p>
                      <p className="text-white/40 text-[11px] truncate">
                        {loc
                          ? live
                            ? `≡ƒƒó Live ┬╖ ${timeAgo(loc.updatedAt)}`
                            : `ΓÜ¬ ${timeAgo(loc.updatedAt)}`
                          : "No location shared"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white/8 px-2 py-0.5 text-[10px] text-white/40 font-medium capitalize">
                      {member.role}
                    </span>
                    {isSelected && <span className="shrink-0 text-sky-400 text-xs">ΓùÅ</span>}
                  </button>
                );
              })}
            </div>

            <div className="h-[env(safe-area-inset-bottom,16px)]" />
          </div>
        </div>

        {/* Drawer collapsed button */}
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

/* ΓöÇΓöÇΓöÇ Avatar DOM helper ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function buildAvatar(member: { name: string; color: string }, stale: boolean): HTMLElement {
  // Premium puck: color gradient ring ΓåÆ white gap ΓåÆ colored face, deep soft shadow
  const ring = document.createElement("div");
  ring.style.cssText = [
    "width:50px;height:50px;border-radius:50%;padding:2.5px;",
    stale
      ? "background:#475569;"
      : `background:linear-gradient(145deg, ${member.color}, ${member.color}cc 60%, #ffffff55);`,
    "box-shadow:0 6px 18px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3);",
  ].join("");
  const gap = document.createElement("div");
  gap.style.cssText =
    "width:100%;height:100%;border-radius:50%;padding:2.5px;background:rgba(255,255,255,0.96);";
  const face = document.createElement("div");
  face.style.cssText = [
    "width:100%;height:100%;border-radius:50%;",
    `background:${stale ? "#334155" : member.color};`,
    stale ? "filter:saturate(0.4);" : "",
    "display:flex;align-items:center;justify-content:center;",
    "font-size:17px;font-weight:800;color:white;",
    "font-family:system-ui,sans-serif;letter-spacing:0.01em;",
    "text-shadow:0 1px 2px rgba(0,0,0,0.25);",
  ].join("");
  face.textContent = member.name.charAt(0).toUpperCase();
  gap.appendChild(face);
  ring.appendChild(gap);
  return ring;
}
