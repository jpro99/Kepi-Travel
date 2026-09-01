"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AirportNavigatorMap } from "@/components/travelAssistant/AirportNavigatorMap";
import {
  deriveEligibleLounges,
  useActiveFlight,
  useNavigatorCredentials,
} from "@/lib/travelAssistant/useActiveFlight";
import { getAirportProximity } from "@/lib/travelAssistant/airportGeo";
import { useAtAirportFlightStatusPoll } from "@/lib/travelAssistant/useAtAirportFlightStatusPoll";
import { buildOsmRasterFallbackStyle, directMaptilerTransformRequest, resolveLiveMapStyle, scheduleMapLoadFallback, attachMapStyleErrorFallback, type LiveMapStyleId } from "@/lib/map/maptilerClient";
import { buildOfflineCityMapStyle } from "@/lib/map/offlineCityMapBundle";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import { resolveCityKeyFromLocation } from "@/lib/travelAssistant/itineraryOfflineCache";
import { listOfflineCacheKeys } from "@/lib/travelAssistant/offlineCacheStore";
import { loadCachedCityMapBundle } from "@/lib/travelAssistant/syncItineraryOfflineAssets";
import { loadOfflineTravelKit } from "@/lib/travelAssistant/offlineTravelKit";
import { resolveLiveCoordinates, resetGeolocationQualityState } from "@/lib/family/geolocationQuality";
import { clearLocationDisplayCache, resolveLocationForMapDisplay } from "@/lib/family/locationDisplayCache";
import { isFamilySharingActive } from "@/lib/family/locationSharingPrefs";
import { burstFamilyLocationFix, refreshFamilyLocationFix } from "@/lib/family/familyLocationWatch";
import { buildFamilyAirportPins } from "@/lib/family/familyAirportPins";
import { useFamilyAirportSync } from "@/lib/family/useFamilyAirportSync";
import { FamilyRallyStrip } from "@/components/travelAssistant/FamilyRallyStrip";
import { readCompassHeading, requestDeviceOrientationPermission } from "@/lib/map/deviceCompass";
import { isAppleMobile } from "@/lib/ui/isStandaloneApp";
import { leaveLiveMap, isLiveMapSessionActive, markLiveMapSessionActive } from "@/lib/travelAssistant/liveMapSession";
import { hideLiveMapStyleLab, liveMapViewLabel } from "@/lib/travelAssistant/mapTabLead";
import { ArrowUp, Compass } from "lucide-react";
import { MOBILE_TAB_BAR_CLEARANCE } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MobileTabBarNav } from "@/components/travelAssistant/mobile/useMobileTabNavigation";

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

/* ─── Map style builders ─────────────────────────────────────── */
type MapStyleId = LiveMapStyleId;

/** Bottom inset so map overlays clear the fixed mobile tab bar on /live-map. */
const MOBILE_TAB_BAR_INSET = MOBILE_TAB_BAR_CLEARANCE;
/** One-row Live Map chrome (back + Plan airport / Family) — map overlays start below this. */
const AIRPORT_SHELL_TOP_INSET = "calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)";
/** Inner map chrome inset when the overlay is already clipped below the shell row. */
const AIRPORT_MAP_INNER_TOP_INSET = "max(0.5rem, env(safe-area-inset-top))";

const IOS_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 25_000,
};

const DEFAULT_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 15_000,
};

function liveMapGeoOptions(): PositionOptions {
  return typeof navigator !== "undefined" && isAppleMobile() ? IOS_GEO_OPTIONS : DEFAULT_GEO_OPTIONS;
}

function defaultMapCenter(locations: LocationPoint[]): { center: [number, number]; zoom: number } {
  if (locations.length === 1) {
    return { center: [locations[0].lon, locations[0].lat], zoom: 16 };
  }
  if (locations.length > 1) {
    const center: [number, number] = [
      locations.reduce((sum, loc) => sum + loc.lon, 0) / locations.length,
      locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length,
    ];
    return { center, zoom: 11 };
  }
  // World view with country borders and labels when no live pins yet
  return { center: [0, 22], zoom: 1.65 };
}

/* ─── Component ──────────────────────────────────────────────── */
export function LiveMapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTripId = searchParams.get("tripId");
  const urlView = searchParams.get("view");
  const urlAirportIata =
    searchParams.get("iata")?.trim().toUpperCase() ||
    searchParams.get("airport")?.trim().toUpperCase() ||
    null;
  const urlAirportMode =
    searchParams.get("mode")?.trim().toLowerCase() === "arrive" ? "arrive" : null;
  const preferAirportView = urlView === "airport";
  const {
    activeFlight,
    previewFlight,
    navigatorFlight,
    navigatorCoachMode,
    journeyPhase,
    hotelLabel,
    reservations: tripReservations,
  } = useActiveFlight({
    tripId: urlTripId,
    preferredIata: urlAirportIata,
    preferredMode: urlAirportMode,
  });
  const [mapView, setMapView] = useState<"family" | "airport">(() => (preferAirportView ? "airport" : "family"));
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const isLoadedRef = useRef(false);
  const usingOsmFallbackRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const myMemberIdRef = useRef<string | null>(null);
  const firstFixRef = useRef<boolean>(false);
  const userMapCenteredRef = useRef(false);

  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
  const [maptilerKey, setMaptilerKey] = useState("");
  const maptilerKeyRef = useRef("");
  const lastAppliedStyleRef = useRef<string | null>(null);
  const mapStyleRef = useRef<MapStyleId>("streets");
  const [mapStyle, setMapStyle] = useState<MapStyleId>("streets");
  const [headingUp, setHeadingUp] = useState(true);
  const headingRef = useRef<number>(0);
  const headingUpRef = useRef(true);
  const coneElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const orientationListeningRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [offlineCityStyle, setOfflineCityStyle] = useState<Record<string, unknown> | null>(null);
  const [offlineCityCenter, setOfflineCityCenter] = useState<[number, number] | null>(null);
  const [offlineCityZoom, setOfflineCityZoom] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(urlTripId);

  useEffect(() => {
    if (preferAirportView) {
      markLiveMapSessionActive();
    }
  }, [preferAirportView]);

  useEffect(() => {
    if (urlTripId) {
      markLiveMapSessionActive();
      return;
    }
    // Defer one frame so markLiveMapSessionActive() from the navigation click wins any race.
    const frame = window.requestAnimationFrame(() => {
      if (isLiveMapSessionActive()) {
        markLiveMapSessionActive();
        return;
      }
      leaveLiveMap("home");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [urlTripId]);

  useEffect(() => {
    headingUpRef.current = headingUp;
  }, [headingUp]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

  useEffect(() => {
    maptilerKeyRef.current = maptilerKey;
  }, [maptilerKey]);

  const applyHeadingToUi = useCallback((heading: number) => {
    headingRef.current = heading;
    const coneRotation = headingUpRef.current ? 0 : heading;
    coneElsRef.current.forEach((cone) => {
      cone.style.transform = `translateX(-50%) rotate(${coneRotation}deg)`;
    });
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    if (headingUpRef.current) {
      map.easeTo({ bearing: -heading, duration: 120, essential: true });
    } else if (Math.abs(map.getBearing?.() ?? 0) > 0.5) {
      map.easeTo({ bearing: 0, duration: 120, essential: true });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const onOrientation = (event: DeviceOrientationEvent): void => {
      const heading = readCompassHeading(event);
      if (heading == null) return;
      applyHeadingToUi(heading);
    };

    const startListening = async (): Promise<void> => {
      if (cancelled || orientationListeningRef.current) return;
      const ok = await requestDeviceOrientationPermission();
      if (!ok || cancelled) return;
      window.addEventListener("deviceorientation", onOrientation, true);
      orientationListeningRef.current = true;
    };

    void startListening();

    return () => {
      cancelled = true;
      window.removeEventListener("deviceorientation", onOrientation, true);
      orientationListeningRef.current = false;
    };
  }, [applyHeadingToUi]);

  useEffect(() => {
    if (!headingUp && mapRef.current && isLoaded) {
      mapRef.current.easeTo({ bearing: 0, duration: 200, essential: true });
      applyHeadingToUi(headingRef.current);
    } else if (headingUp && isLoaded) {
      applyHeadingToUi(headingRef.current);
    }
  }, [headingUp, isLoaded, applyHeadingToUi]);

  useEffect(() => {
    if (isFamilySharingActive()) {
      setSharingLocation(true);
      burstFamilyLocationFix();
    }
    const onStart = () => setSharingLocation(true);
    const onStop = () => setSharingLocation(false);
    window.addEventListener("kepi:family-start-sharing", onStart);
    window.addEventListener("kepi:family-stop-sharing", onStop);
    return () => {
      window.removeEventListener("kepi:family-start-sharing", onStart);
      window.removeEventListener("kepi:family-stop-sharing", onStop);
    };
  }, []);
  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { maptilerKey?: string }) => { if (d.maptilerKey) setMaptilerKey(d.maptilerKey); })
      .catch(() => null);

    void fetch("/api/family", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { group: FamilyGroup; locations: Record<string, LocationPoint>; myMemberId?: string }) => {
        setGroup(d.group);
        if (d.myMemberId) {
          setMyMemberId(d.myMemberId);
          myMemberIdRef.current = d.myMemberId;
        }
        if (d.locations) {
          const next: Record<string, LocationPoint> = {};
          for (const [memberId, loc] of Object.entries(d.locations)) {
            const resolved = resolveLocationForMapDisplay(memberId, loc);
            if (resolved) next[memberId] = { ...loc, ...resolved };
          }
          setLocations(next);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const updateOnline = () => setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const kit = await loadOfflineTravelKit();
      const destination = kit?.destination ?? "";
      let cityKey = resolveCityKeyFromLocation(destination)?.cityKey ?? null;
      if (!cityKey) {
        const keys = await listOfflineCacheKeys();
        const cached = keys.find((key) => key.startsWith("city-map:"));
        cityKey = cached ? cached.replace("city-map:", "") : null;
      }
      if (!cityKey) return;
      const bundle = await loadCachedCityMapBundle(cityKey);
      if (!bundle) return;
      setOfflineCityStyle(buildOfflineCityMapStyle(bundle));
      setOfflineCityCenter(bundle.center);
      setOfflineCityZoom(bundle.defaultZoom);
    })().catch(() => null);
  }, [activeTripId]);

  useEffect(() => {
    void fetch("/api/trips", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { activeTripId?: string; trips?: { id: string }[] }) => {
        setActiveTripId((prev) => prev ?? d.activeTripId ?? d.trips?.[0]?.id ?? null);
      })
      .catch(() => null);
  }, []);

  /* ── Poll locations every 10 s (faster than before) ── */
  const mergePolledLocations = useCallback((incoming: Record<string, LocationPoint>) => {
    const next: Record<string, LocationPoint> = {};
    for (const [memberId, loc] of Object.entries(incoming)) {
      const resolved = resolveLocationForMapDisplay(memberId, loc);
      if (resolved) next[memberId] = { ...loc, ...resolved };
    }
    setLocations((prev) => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      void fetch("/api/family", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { locations?: Record<string, LocationPoint> }) => {
          if (d.locations) mergePolledLocations(d.locations);
        })
        .catch(() => null);
    }, 10_000);
    return () => clearInterval(id);
  }, [mergePolledLocations]);

  /* ── Place/update markers (move existing ones, no full rebuild) ── */
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
          // GPS noise filter — skip if moved less than ~15 metres
          // Consumer GPS drifts 10-30m even when standing still
          const dLng = Math.abs(loc.lon - from.lng);
          const dLat = Math.abs(loc.lat - from.lat);
          const minDelta = (loc.accuracy ?? 30) > 50 ? 0.0004 : 0.00015;
          if (dLng < minDelta && dLat < minDelta) return;
          const smoothWeight = (loc.accuracy ?? 30) <= 35 ? 0.7 : 0.95;
          const to = {
            lng: from.lng * (1 - smoothWeight) + loc.lon * smoothWeight,
            lat: from.lat * (1 - smoothWeight) + loc.lat * smoothWeight,
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

        // Direction cone — only on my marker, shows which way phone is pointing
        if (isMyMarker) {
          const cone = document.createElement("div");
          cone.id = `kepi-cone-${member.id}`;
          cone.style.cssText = [
            "position:absolute;width:0;height:0;",
            "border-left:14px solid transparent;",
            "border-right:14px solid transparent;",
            `border-bottom:30px solid ${member.color};`,
            "opacity:0.9;",
            "top:-34px;left:50%;transform:translateX(-50%);",
            "transform-origin:center 34px;",
            "filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));",
          ].join("");
          const coneRotation = headingUpRef.current ? 0 : headingRef.current;
          cone.style.transform = `translateX(-50%) rotate(${coneRotation}deg)`;
          coneElsRef.current.set(member.id, cone);
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

        // Frosted name chip with live/stale dot — readable on dark and satellite
        const lbl = document.createElement("div");
        lbl.style.cssText = [
          "display:flex;align-items:center;gap:6px;",
          "background:rgba(10,16,28,0.82);border:1px solid rgba(255,255,255,0.18);",
          "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);",
          "border-radius:9999px;padding:6px 14px;",
          "font-size:15px;font-weight:800;color:#f8fafc;",
          "box-shadow:0 4px 14px rgba(0,0,0,0.35);",
          "white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;",
          "font-family:system-ui,sans-serif;letter-spacing:-0.01em;",
        ].join("");
        const liveDot = document.createElement("span");
        liveDot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${stale ? "#64748b" : "#34d399"};${stale ? "" : "box-shadow:0 0 8px rgba(52,211,153,0.9);"}`;
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
          coneElsRef.current.delete(id);
        }
      });

      m._kepiMarkers = existing;
    }).catch(console.error);
  }, [group, locations]);

  /* ── Init family basemap (skip while airport navigator owns WebGL) ── */
  useEffect(() => {
    if (!mapEl.current) return;
    let cancelled = false;
    let clearLoadFallback: (() => void) | null = null;

    const teardownFamilyMap = (): void => {
      clearLoadFallback?.();
      clearLoadFallback = null;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const old = mapRef.current._kepiMarkers as Record<string, any> | undefined;
        if (old) Object.values(old).forEach((mk: unknown) => (mk as { remove(): void }).remove());
        mapRef.current.remove();
        mapRef.current = null;
      }
      isLoadedRef.current = false;
      setIsLoaded(false);
      lastAppliedStyleRef.current = null;
    };

    if (mapView === "airport") {
      teardownFamilyMap();
      return () => {
        cancelled = true;
      };
    }

    isLoadedRef.current = false;
    setIsLoaded(false);
    setIsError(false);
    usingOsmFallbackRef.current = true;
    teardownFamilyMap();

    const markMapReady = (map: import("maplibre-gl").Map): void => {
      if (cancelled || isLoadedRef.current) return;
      isLoadedRef.current = true;
      setIsLoaded(true);
      setIsError(false);
      placeMarkers(map);
      window.requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      });
    };

    void (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !mapEl.current) return;

        const locs = Object.values(locations);
        const { center, zoom } = defaultMapCenter(locs);
        const key = maptilerKeyRef.current.trim();
        usingOsmFallbackRef.current = !key;
        const initialStyle = key
          ? resolveLiveMapStyle(mapStyleRef.current, key)
          : buildOsmRasterFallbackStyle();
        lastAppliedStyleRef.current = key
          ? `${mapStyleRef.current}:${key}`
          : "__osm__";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = new (ml as any).Map({
          container: mapEl.current,
          style: initialStyle,
          center,
          zoom,
          minZoom: 1,
          maxZoom: 20,
          pixelRatio: getMapPixelRatio(),
          attributionControl: false,
          fadeDuration: 0,
          ...(maptilerKeyRef.current.trim()
            ? { transformRequest: directMaptilerTransformRequest(maptilerKeyRef.current) }
            : {}),
        });
        const unbindResize = bindMapResize(mapEl.current, map);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).NavigationControl({ showCompass: true }), "top-right");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addControl(new (ml as any).AttributionControl({ compact: true }), "bottom-right");

        map.on("load", () => {
          markMapReady(map);
        });

        attachMapStyleErrorFallback(map, {
          isCancelled: () => cancelled,
          isLoaded: () => isLoadedRef.current,
          markLoaded: () => {
            isLoadedRef.current = true;
          },
          usingOsmFallback: usingOsmFallbackRef,
          onRecovered: () => markMapReady(map),
        });

        clearLoadFallback = scheduleMapLoadFallback(map, {
          isCancelled: () => cancelled,
          isLoaded: () => isLoadedRef.current,
          usingOsmFallback: usingOsmFallbackRef,
          onReady: () => markMapReady(map),
        });

        mapRef.current = map;
        map.on("remove", () => {
          clearLoadFallback?.();
          unbindResize();
        });
      } catch (err) {
        if (!cancelled) {
          setIsError(true);
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      teardownFamilyMap();
    };
  }, [mapView]);

  /* ── Style toggle + MapTiler upgrade when key arrives ── */
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const key = maptilerKey.trim();
    usingOsmFallbackRef.current = !key;

    const styleFingerprint = !isOnline && offlineCityStyle
      ? `offline:${activeTripId ?? "none"}`
      : key
        ? `${mapStyle}:${key}`
        : "__osm__";
    if (lastAppliedStyleRef.current === styleFingerprint) return;
    lastAppliedStyleRef.current = styleFingerprint;

    if (!isOnline && offlineCityStyle) {
      mapRef.current.setStyle(offlineCityStyle);
      mapRef.current.once("idle", () => {
        if (mapRef.current && offlineCityCenter && offlineCityZoom !== null) {
          mapRef.current.flyTo({
            center: offlineCityCenter,
            zoom: offlineCityZoom,
            essential: true,
          });
        }
        if (mapRef.current) placeMarkers(mapRef.current);
      });
      return;
    }

    mapRef.current.setStyle(
      key ? resolveLiveMapStyle(mapStyle, key) : buildOsmRasterFallbackStyle(),
    );
    mapRef.current.once("idle", () => {
      if (mapRef.current) placeMarkers(mapRef.current);
    });
  }, [mapStyle, maptilerKey, isLoaded, isOnline, offlineCityStyle, offlineCityCenter, offlineCityZoom, activeTripId]);

  /* ── Re-place/move markers when locations update ── */
  useEffect(() => {
    if (mapRef.current && isLoaded) placeMarkers(mapRef.current);
  }, [placeMarkers, isLoaded]);

  /* ── Fit all members ── */
  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const locs = Object.values(locations);
    if (!locs.length) return;
    if (locs.length === 1) {
      mapRef.current.flyTo({ center: [locs[0].lon, locs[0].lat], zoom: 17, essential: true });
      return;
    }
    import("maplibre-gl").then(({ LngLatBounds }) => {
      const b = new LngLatBounds();
      locs.forEach(l => b.extend([l.lon, l.lat]));
      mapRef.current?.fitBounds(b, { padding: 80, maxZoom: 16, duration: 800 });
    }).catch(console.error);
  }, [locations]);

  /* ── Airport Navigator integration (shared selection — Map button asks
        the SAME question AirportMode does, via useActiveFlight) ── */
  const navFlight = navigatorFlight;
  const { credentials: navCredentials, profile: navProfile, saveCredentials } = useNavigatorCredentials();
  const [navLat, setNavLat] = useState<number | null>(null);
  const [navLon, setNavLon] = useState<number | null>(null);
  const [navAccuracyM, setNavAccuracyM] = useState<number | null>(null);
  const navWatchRef = useRef<number | null>(null);
  const autoAirportRef = useRef(false);
  const mapViewPinnedByUser = useRef(false);

  useEffect(() => {
    if (mapView !== "family" || !mapRef.current || !isLoaded) return;
    window.requestAnimationFrame(() => {
      try {
        mapRef.current?.resize();
      } catch {
        /* ignore */
      }
    });
  }, [mapView, isLoaded, drawerOpen]);

  const navIata =
    navigatorCoachMode === "arrive"
      ? (navFlight?.f.flightArrivalAirport ?? "")
      : (navFlight?.f.flightDepartureAirport ?? "");

  const navProximity = useMemo(
    () => getAirportProximity(navLat, navLon, navIata),
    [navLat, navLon, navIata],
  );

  // Passive GPS — steady refresh at the airport (map pin + gate walk); avoid 0ms maximumAge loops.
  useEffect(() => {
    if (!navigator.geolocation) return;
    if (navWatchRef.current !== null) {
      navigator.geolocation.clearWatch(navWatchRef.current);
      navWatchRef.current = null;
    }
    const atAirport =
      navProximity.status === "at-airport" || navProximity.status === "in-terminal";
    const maximumAge = atAirport ? 15_000 : 10_000;
    navWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setNavLat(pos.coords.latitude);
        setNavLon(pos.coords.longitude);
        setNavAccuracyM(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);
      },
      () => null,
      {
        enableHighAccuracy: true,
        maximumAge,
        timeout: liveMapGeoOptions().timeout ?? 15_000,
      },
    );
    return () => {
      if (navWatchRef.current !== null) navigator.geolocation.clearWatch(navWatchRef.current);
      navWatchRef.current = null;
    };
  }, [navProximity.status]);

  const atNavAirport =
    navProximity.status === "at-airport" || navProximity.status === "in-terminal";

  const airportLiveMode = Boolean(
    navigatorCoachMode === "arrive"
      ? journeyPhase.kind === "just-landed" && atNavAirport
      : activeFlight && atNavAirport,
  );
  const airportPreviewMode = Boolean(navFlight && !airportLiveMode);

  const liveFlightStatus = useAtAirportFlightStatusPoll({
    flight: navFlight?.f ?? null,
    proximity: navProximity.status === "unknown" ? "away" : navProximity.status,
    enabled: airportLiveMode && mapView === "airport",
  });

  useEffect(() => {
    if (!preferAirportView || !navigatorFlight) return;
    if (!mapViewPinnedByUser.current) {
      setMapView("airport");
    }
  }, [preferAirportView, navigatorFlight]);

  // Default map to the user's actual location (once), not world view or airport campus
  useEffect(() => {
    if (!isLoaded || !mapRef.current || userMapCenteredRef.current || mapView !== "family") return;

    const centerOn = (lat: number, lon: number): void => {
      if (userMapCenteredRef.current || !mapRef.current) return;
      userMapCenteredRef.current = true;
      mapRef.current.easeTo({ center: [lon, lat], zoom: 15, duration: 1200, essential: true });
    };

    const myId = myMemberIdRef.current;
    if (myId && locations[myId]) {
      centerOn(locations[myId].lat, locations[myId].lon);
      return;
    }
    if (navLat != null && navLon != null) {
      centerOn(navLat, navLon);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNavLat(pos.coords.latitude);
        setNavLon(pos.coords.longitude);
        centerOn(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        /* keep existing default center */
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: liveMapGeoOptions().timeout ?? 12_000 },
    );
  }, [isLoaded, locations, mapView, navLat, navLon]);

  // Airport navigator: deep-link (?view=airport) or auto-switch when geofenced at departure airport
  useEffect(() => {
    if (preferAirportView && navigatorFlight) {
      if (!mapViewPinnedByUser.current) {
        setMapView("airport");
      }
      return;
    }
    if (!activeFlight) {
      if (!preferAirportView) {
        setMapView((prev) => (prev === "airport" ? "family" : prev));
      }
      return;
    }
    if (atNavAirport) {
      if (!autoAirportRef.current) {
        autoAirportRef.current = true;
        setMapView("airport");
      }
      return;
    }
    autoAirportRef.current = false;
    if (!preferAirportView) {
      setMapView((prev) => (prev === "airport" ? "family" : prev));
    }
  }, [atNavAirport, activeFlight, preferAirportView, navigatorFlight]);

  const navEligibleLounges = useMemo(
    () =>
      navFlight
        ? deriveEligibleLounges(
            navProfile,
            navFlight.f.flightAirline ?? navFlight.f.provider ?? "",
            navFlight.f.flightDepartureAirport ?? "",
          )
        : [],
    [navProfile, navFlight],
  );

  const navMinutesToDeparture = navFlight ? (navFlight.utcMs - Date.now()) / 60_000 : 0;

  const {
    sync: airportSync,
    groupBoarding,
    setPhase: setFamilyJourneyPhase,
    setRally: setFamilyRally,
    cancelRally: cancelFamilyRally,
    busy: familySyncBusy,
  } = useFamilyAirportSync({
    tripId: activeTripId,
    groupId: group?.id ?? null,
    minutesToDeparture: activeFlight ? navMinutesToDeparture : null,
  });

  const handleRallyAtGate = useCallback(() => {
    if (!activeFlight) return;
    const iata = activeFlight.f.flightDepartureAirport ?? "";
    const gate = activeFlight.f.flightDepartureGate ?? null;
    if (!iata || !gate) return;
    void setFamilyRally({
      kind: "gate",
      iata,
      gateCode: gate,
      label: `Gate ${gate.toUpperCase()}`,
    });
  }, [activeFlight, setFamilyRally]);

  /* ── Share my location ── */
  const stopLocalLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    firstFixRef.current = false;
  }, []);

  const startLocalLocationWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const resolved = resolveLiveCoordinates(pos.coords, pos.timestamp);
        if (!resolved) return;
        const { lat, lon, accuracy } = resolved;

        if (pos.coords.heading != null && Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0) {
          applyHeadingToUi(pos.coords.heading);
        }

        void fetch("/api/family", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-location", lat, lon, accuracy }),
        }).catch(() => null);

        const memberId = myMemberIdRef.current;
        if (memberId) {
          setLocations((prev) => ({
            ...prev,
            [memberId]: {
              lat,
              lon,
              accuracy,
              updatedAt: new Date().toISOString(),
              memberId,
            },
          }));
          if (mapRef.current && !firstFixRef.current) {
            firstFixRef.current = true;
            mapRef.current.easeTo({ center: [lon, lat], zoom: 17, duration: 1200 });
          }
        }
      },
      (err) => {
        stopLocalLocationWatch();
        if (err.code === 1) {
          window.dispatchEvent(new CustomEvent("kepi:family-sharing-permission-denied"));
          return;
        }
        window.setTimeout(() => {
          if (isFamilySharingActive()) startLocalLocationWatch();
        }, 15_000);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 45_000 },
    );
  }, [stopLocalLocationWatch, applyHeadingToUi]);

  useEffect(() => {
    if (sharingLocation) startLocalLocationWatch();
    else stopLocalLocationWatch();
    return () => stopLocalLocationWatch();
  }, [sharingLocation, startLocalLocationWatch, stopLocalLocationWatch]);

  const shareLocation = useCallback(() => {
    if (sharingLocation) {
      setSharingLocation(false);
      window.dispatchEvent(new CustomEvent("kepi:family-stop-sharing"));
      return;
    }
    if (!navigator.geolocation) {
      alert("Geolocation not supported on this device.");
      return;
    }
    setSharingLocation(true);
    window.dispatchEvent(new CustomEvent("kepi:family-start-sharing"));
  }, [sharingLocation]);

  const refreshGps = useCallback(() => {
    if (!navigator.geolocation || gpsRefreshing) return;
    setGpsRefreshing(true);
    if (myMemberId) clearLocationDisplayCache(myMemberId);
    resetGeolocationQualityState();
    refreshFamilyLocationFix();
    window.setTimeout(() => setGpsRefreshing(false), 8_000);
  }, [gpsRefreshing, myMemberId]);

  useEffect(() => () => stopLocalLocationWatch(), [stopLocalLocationWatch]);

  /* ── Derived ── */
  const members = group?.members ?? [];
  const liveCount = members.filter(m => locations[m.id] && !isStale(locations[m.id].updatedAt)).length;

  const familyAirportPins = useMemo(
    () =>
      navIata
        ? buildFamilyAirportPins(members, locations, navIata, {
            excludeMemberId: myMemberId,
          })
        : [],
    [navIata, members, locations, myMemberId],
  );

  const handleFamilyPinTap = useCallback(
    (memberId: string) => {
      setMapView("family");
      setSelected(memberId);
      setDrawerOpen(false);
      const loc = locations[memberId];
      if (loc && mapRef.current) {
        mapRef.current.flyTo({ center: [loc.lon, loc.lat], zoom: 16, duration: 900, essential: true });
      }
    },
    [locations],
  );

  const myLoc = myMemberId ? locations[myMemberId] : null;
  const myAccuracyM = myLoc?.accuracy;
  const selMember = selected ? members.find(m => m.id === selected) : null;
  const selLoc = selected ? locations[selected] : null;
  const lightChrome = mapStyle === "streets";
  const chromeBtnIdle = lightChrome
    ? "bg-white/90 text-slate-800 border-slate-200"
    : "bg-black/45 text-white border-white/15";
  const chromeBtnActive = "bg-[#007AFF] text-white";
  const styleToggleClass = (active: boolean) =>
    `min-h-[44px] px-4 py-2.5 text-[15px] font-bold transition-all ${
      active ? chromeBtnActive : `${chromeBtnIdle} backdrop-blur-md`
    }`;

  const enableCompass = useCallback(async () => {
    const ok = await requestDeviceOrientationPermission();
    if (!ok) return;
    if (!orientationListeningRef.current) {
      const onOrientation = (event: DeviceOrientationEvent): void => {
        const heading = readCompassHeading(event);
        if (heading == null) return;
        applyHeadingToUi(heading);
      };
      window.addEventListener("deviceorientation", onOrientation, true);
      orientationListeningRef.current = true;
    }
    setHeadingUp(true);
  }, [applyHeadingToUi]);

  const toggleHeadingUp = useCallback(() => {
    setHeadingUp((current) => {
      if (current) return false;
      void enableCompass();
      return true;
    });
  }, [enableCompass]);

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
        .lm-drawer-scroll {
          overflow-y: auto;
          overscroll-behavior: contain;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
        }
        .maplibregl-ctrl-attrib { font-size: 11px !important; opacity: 0.75; }
        .maplibregl-ctrl-group { border-radius: 14px !important; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.2) !important; }
        .maplibregl-ctrl button { width: 44px !important; height: 44px !important; }
        .maplibregl-ctrl-bottom-left,
        .maplibregl-ctrl-bottom-right {
          bottom: calc(68px + 0.5rem + max(0.625rem, env(safe-area-inset-bottom)) + 0.25rem) !important;
        }
      `}</style>

      <div
        className={`fixed inset-0 z-[100] flex flex-col overflow-hidden ${lightChrome ? "bg-slate-100" : "bg-slate-950"}`}
        style={{ paddingBottom: MOBILE_TAB_BAR_INSET }}
      >
        {/* Map stage — flex child fills viewport minus tab bar clearance */}
        <div className="relative min-h-0 w-full flex-1">
        {/* Map canvas — family / world basemap with country labels */}
        <div
          ref={mapEl}
          className={`absolute inset-0 z-0 h-full w-full bg-[#dbeafe] ${mapView === "airport" ? "opacity-0 pointer-events-none" : ""}`}
        />

        {/* No separate "Today" flight banner here — flight info lives in the map
            preview banner (plan mode) or the flight hero (live mode). */}

        {/* Airport Navigator overlay — preview anytime; live navigation at geofence */}
        {mapView === "airport" && navFlight && (
          <div
            className="absolute left-0 right-0 bottom-0 z-40"
            style={{ top: AIRPORT_SHELL_TOP_INSET }}
          >
            <AirportNavigatorMap
              fill
              previewMode={airportPreviewMode}
              maptilerKey={maptilerKey}
              iata={navIata}
              gateCode={
                navigatorCoachMode === "arrive"
                  ? (liveFlightStatus?.departureGate
                    ?? navFlight.f.flightArrivalGate
                    ?? navFlight.f.flightDepartureGate
                    ?? null)
                  : (liveFlightStatus?.departureGate ?? navFlight.f.flightDepartureGate ?? null)
              }
              airlineName={navFlight.f.flightAirline ?? navFlight.f.provider ?? null}
              flightNumber={navFlight.f.flightNumber ?? null}
              arrivalAirport={navFlight.f.flightArrivalAirport ?? null}
              departureAirport={navFlight.f.flightDepartureAirport ?? null}
              departureTerminal={
                liveFlightStatus?.departureTerminal ?? navFlight.f.flightDepartureTerminal ?? null
              }
              arrivalTerminal={navFlight.f.flightArrivalTerminal ?? null}
              coachMode={navigatorCoachMode}
              landedMinutesAgo={
                journeyPhase.kind === "just-landed" ? journeyPhase.landedMinutesAgo : null
              }
              hotelLabel={hotelLabel}
              flightDate={
                navFlight.f.flightArrivalTime?.trim()?.slice(0, 10) ||
                navFlight.f.localTime?.trim()?.slice(0, 10) ||
                null
              }
              flightArrivalTime={navFlight.f.flightArrivalTime ?? null}
              flightTimezone={navFlight.f.timezone ?? null}
              flightStatusLabel={
                navigatorCoachMode === "arrive"
                  ? "Landed"
                  : liveFlightStatus?.flightStatus
                    ?? ((liveFlightStatus?.delayMinutes ?? navFlight.f.flightDelayMinutes ?? 0) > 0
                      ? `Delayed +${liveFlightStatus?.delayMinutes ?? navFlight.f.flightDelayMinutes}m`
                      : navFlight.f.flightStatus ?? (navFlight.f.flightOnTime === false ? "Delayed" : "On time"))
              }
              flightDelayed={
                (liveFlightStatus?.delayMinutes ?? navFlight.f.flightDelayMinutes ?? 0) > 0
                || liveFlightStatus?.onTime === false
                || navFlight.f.flightOnTime === false
              }
              proximityStatus={airportLiveMode ? navProximity.status : "preview"}
              minutesToDeparture={navMinutesToDeparture}
              userLat={navLat}
              userLon={navLon}
              userAccuracyM={navAccuracyM}
              credentials={navCredentials}
              onCredentialsAnswer={saveCredentials}
              eligibleLoungeNames={navigatorCoachMode === "arrive" ? [] : navEligibleLounges}
              onSwitchToFamilyView={() => {
                mapViewPinnedByUser.current = true;
                setMapView("family");
              }}
              familyPins={airportLiveMode ? familyAirportPins : []}
              onFamilyPinTap={handleFamilyPinTap}
              activeRally={airportLiveMode && airportSync?.rally?.status === "active" ? airportSync.rally : null}
              shellBottomInset="0px"
              shellTopInset={AIRPORT_MAP_INNER_TOP_INSET}
              tripReservations={tripReservations}
              activeReservationId={navFlight.f.id}
            />
            {airportLiveMode && members.length >= 2 ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-50 px-3"
                style={{ bottom: "5.5rem" }}
              >
                <FamilyRallyStrip
                  members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
                  myMemberId={myMemberId}
                  sync={airportSync}
                  groupBoarding={groupBoarding}
                  activeRally={airportSync?.rally?.status === "active" ? airportSync.rally : null}
                  gateCode={navFlight.f.flightDepartureGate ?? null}
                  iata={navFlight.f.flightDepartureAirport ?? "—"}
                  busy={familySyncBusy}
                  onSetPhase={(phase) => void setFamilyJourneyPhase(phase)}
                  onSetRallyAtGate={handleRallyAtGate}
                  onCancelRally={() => void cancelFamilyRally()}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Top scrim */}
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className={`h-32 bg-gradient-to-b ${lightChrome ? "from-white/90 via-white/40" : "from-black/60 via-black/20"} to-transparent`} />
        </div>

        {/* Mobile header — airport mode uses a single compact row (no family chrome stack). */}
        {mapView === "airport" && navFlight ? (
          <div
            className="absolute top-0 left-0 right-0 z-[60] flex items-center gap-2 px-3 pb-2 md:hidden"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <button
              type="button"
              onClick={() => leaveLiveMap("home")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[22px] font-bold shadow-lg backdrop-blur-md border ${chromeBtnIdle}`}
              aria-label="Back to trip home"
            >
              ←
            </button>
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-full border border-white/15 shadow-xl">
              {([
                ["airport", liveMapViewLabel("airport", airportPreviewMode)],
                ["family", liveMapViewLabel("family", false)],
              ] as ["airport" | "family", string][]).map(([viewId, viewLabel]) => (
                <button
                  key={viewId}
                  type="button"
                  onClick={() => {
                    mapViewPinnedByUser.current = true;
                    setMapView(viewId);
                  }}
                  className={`min-h-[48px] flex-1 px-3 py-2.5 text-[15px] font-bold backdrop-blur-md transition-all ${
                    mapView === viewId ? "bg-white text-slate-900" : "bg-black/45 text-white/90"
                  }`}
                >
                  {viewLabel}
                </button>
              ))}
            </div>
          </div>
        ) : (
        <div
          className="absolute top-0 left-0 right-0 z-30 flex flex-col gap-3 px-4 pb-2 md:hidden"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => leaveLiveMap("home")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[22px] font-bold shadow-lg backdrop-blur-md border ${chromeBtnIdle}`}
              aria-label="Back to trip home"
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-[20px] font-bold leading-tight truncate ${lightChrome ? "text-slate-900" : "text-white drop-shadow"}`}>
                {group?.name ?? "My Family"}
              </p>
              <p className={`text-[15px] leading-snug ${lightChrome ? "text-slate-600" : "text-white/75"}`}>
                {liveCount > 0 ? `${liveCount} live · updates every 10s` : "No live locations"}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleHeadingUp}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[22px] shadow-lg border ${
                headingUp ? "bg-[#007AFF] text-white border-[#007AFF]" : chromeBtnIdle
              }`}
              title={headingUp ? "Heading up — tap for north up" : "North up — tap for heading up"}
            >
              {headingUp ? <Compass className="h-5 w-5" strokeWidth={2} aria-hidden /> : <ArrowUp className="h-5 w-5" strokeWidth={2} aria-hidden />}
            </button>
          </div>
          {!hideLiveMapStyleLab() ? (
          <div className={`flex overflow-hidden rounded-2xl border shadow-lg self-end ${lightChrome ? "border-slate-200" : "border-white/15"}`}>
            {([["dark", "Dark"], ["streets", "Map"], ["satellite", "Sat+"]] as [MapStyleId, string][]).map(([styleId, styleLabel]) => (
              <button
                key={styleId}
                type="button"
                onClick={() => setMapStyle(styleId)}
                className={styleToggleClass(mapStyle === styleId)}
              >
                {styleLabel}
              </button>
            ))}
          </div>
          ) : null}
        </div>
        )}

        {/* Desktop back + title + style toggle */}
        <div className="absolute top-0 left-0 right-0 z-[60] hidden items-center gap-3 px-4 pb-2 pt-4 md:flex">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 text-xl text-white shadow-lg backdrop-blur-md"
            aria-label="Back"
          >
            ←
          </button>
          {mapView === "airport" && navFlight ? (
            <div className="flex min-w-0 flex-1 justify-center overflow-hidden rounded-full border border-white/15 shadow-xl">
              {([
                ["airport", liveMapViewLabel("airport", airportPreviewMode)],
                ["family", liveMapViewLabel("family", false)],
              ] as ["airport" | "family", string][]).map(([viewId, viewLabel]) => (
                <button
                  key={viewId}
                  type="button"
                  onClick={() => {
                    mapViewPinnedByUser.current = true;
                    setMapView(viewId);
                  }}
                  className={`min-h-[44px] px-5 py-2 text-[15px] font-bold backdrop-blur-md transition-all ${
                    mapView === viewId ? "bg-white text-slate-900" : "bg-black/45 text-white/90"
                  }`}
                >
                  {viewLabel}
                </button>
              ))}
            </div>
          ) : (
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-bold leading-tight tracking-tight text-white drop-shadow">
              {group?.name ?? "Family"}
            </p>
            <p className="text-[15px] leading-snug text-white/75">
              {liveCount > 0 ? `${liveCount} live · updates every 10s` : "No live locations"}
            </p>
          </div>
          )}
          {mapView === "family" && !hideLiveMapStyleLab() ? (
          <div className="flex overflow-hidden rounded-full border border-white/10 shadow-lg">
            {([["dark", "Dark"], ["streets", "Map"], ["satellite", "Sat+"]] as [MapStyleId, string][]).map(([styleId, styleLabel]) => (
              <button
                key={styleId}
                type="button"
                onClick={() => setMapStyle(styleId)}
                className={styleToggleClass(mapStyle === styleId)}
              >
                {styleLabel}
              </button>
            ))}
          </div>
          ) : null}
          {mapView === "family" ? (
          <button
            type="button"
            onClick={toggleHeadingUp}
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg text-xl transition-all ${
              headingUp
                ? "bg-[#007AFF] text-white shadow-blue-500/40"
                : "bg-black/40 backdrop-blur-md text-white/80"
            }`}
            title={headingUp ? "Heading up (tap for north up)" : "North up (tap for heading up)"}
          >
            {headingUp ? <Compass className="h-5 w-5" strokeWidth={2} aria-hidden /> : <ArrowUp className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </button>
          ) : null}
        </div>

        {/* Loading overlay */}
        {!isLoaded && !isError && mapView !== "airport" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <div className="h-8 w-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            <p className="text-white/70 text-[15px]">Loading map…</p>
          </div>
        )}

        {/* Error overlay */}
        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
            <span className="text-4xl">🗺</span>
            <p className="text-red-400 text-sm max-w-xs leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Fit-all FAB */}
        {Object.keys(locations).length > 0 && isLoaded && (
          <button
            type="button"
            onClick={fitAll}
            className="absolute left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-md text-white shadow-lg text-[22px] border border-white/15"
            style={{ bottom: drawerOpen ? "15.5rem" : "1rem" }}
            title="Fit all members"
          >
            ⊙
          </button>
        )}

        {/* Selected member card */}
        {selMember && selLoc && (
          <div
            className="lm-card absolute left-4 right-4 z-20 rounded-2xl overflow-hidden shadow-2xl"
            style={{ bottom: drawerOpen ? "14.25rem" : "1rem" }}
          >
            <div className={`backdrop-blur-xl border p-5 ${lightChrome ? "bg-white/95 border-slate-200" : "bg-slate-900/95 border-white/10"}`}>
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className="h-14 w-14 rounded-full flex items-center justify-center text-[20px] font-bold text-white shadow-lg"
                    style={{ background: selMember.color }}
                  >
                    {selMember.name.charAt(0).toUpperCase()}
                  </div>
                  {!isStale(selLoc.updatedAt) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-[19px] truncate ${lightChrome ? "text-slate-900" : "text-white"}`}>{selMember.name}</p>
                  <p className={`text-[15px] mt-0.5 ${lightChrome ? "text-slate-600" : "text-white/60"}`}>
                    {isStale(selLoc.updatedAt)
                      ? `⚠ ${timeAgo(selLoc.updatedAt)} — may be outdated`
                      : `🟢 Live · ${timeAgo(selLoc.updatedAt)}`}
                  </p>
                  {selLoc.label && (
                    <p className={`text-[14px] mt-1 truncate ${lightChrome ? "text-slate-500" : "text-white/45"}`}>📍 {selLoc.label}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => mapRef.current?.flyTo({ center: [selLoc.lon, selLoc.lat], zoom: 17, essential: true })}
                    className="rounded-xl bg-sky-600 px-4 py-2.5 text-[15px] font-bold text-white shadow min-h-[44px]"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className={`rounded-xl px-4 py-2.5 text-[15px] font-bold min-h-[44px] ${lightChrome ? "bg-slate-100 text-slate-700" : "bg-white/10 text-white/80"}`}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Family controls belong only to the family basemap, never Airport Mode. */}
        {mapView === "family" ? (
        <>
        <div
          data-testid="family-map-drawer"
          className={`absolute left-0 right-0 bottom-0 z-40 transition-transform duration-300 pointer-events-auto ${drawerOpen ? "translate-y-0" : "translate-y-full"}`}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(v => !v)}
            className={`w-full flex justify-center pt-2 pb-1 backdrop-blur-xl ${lightChrome ? "bg-white/95" : "bg-slate-900/95"}`}
            aria-label="Toggle member list"
          >
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </button>

          <div className={`backdrop-blur-xl border-t lm-drawer ${lightChrome ? "bg-white/95 border-slate-200" : "bg-slate-900/95 border-white/10"}`}>
            <div className={`flex items-center justify-between px-4 py-4 border-b ${lightChrome ? "border-slate-200" : "border-white/5"}`}>
              <div>
                <p className={`text-[19px] font-bold ${lightChrome ? "text-slate-900" : "text-white"}`}>
                  {group?.name ?? "Family"}
                  {liveCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[13px] font-bold text-emerald-500">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      {liveCount} live
                    </span>
                  )}
                </p>
                <p className={`text-[15px] mt-1 ${lightChrome ? "text-slate-600" : "text-white/50"}`}>{members.length} member{members.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {sharingLocation && (
                  <button
                    type="button"
                    onClick={refreshGps}
                    disabled={gpsRefreshing}
                    className={`rounded-xl border px-4 py-2.5 text-[15px] font-bold min-h-[48px] disabled:opacity-50 ${
                      lightChrome ? "border-slate-200 bg-slate-50 text-slate-800" : "border-white/15 bg-white/5 text-white/85"
                    }`}
                    title="Take fresh GPS samples — use on your phone outdoors for best accuracy"
                  >
                    {gpsRefreshing ? "Locating…" : "Refresh GPS"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={shareLocation}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-bold shadow min-h-[48px] transition-all ${
                    sharingLocation
                      ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                      : "bg-sky-600 text-white"
                  }`}
                >
                  <span>{sharingLocation ? "🟢" : "📍"}</span>
                  {sharingLocation ? "Sharing" : "Share me"}
                </button>
              </div>
            </div>

            {sharingLocation && myAccuracyM != null && myAccuracyM > 45 && (
              <p className="px-4 pb-2 text-[14px] leading-relaxed text-amber-600">
                Position may be off by ~{Math.round(myAccuracyM)}m.
                {typeof window !== "undefined" && !/iPhone|iPad|Android/i.test(navigator.userAgent)
                  ? " Desktop browsers use Wi‑Fi guessing — open on your phone for house-level accuracy."
                  : " Step outside or tap Refresh GPS for a tighter fix."}
              </p>
            )}

            <div className="lm-drawer-scroll max-h-[min(42dvh,360px)] divide-y divide-slate-200/80">
              {members.length === 0 && (
                <div className={`px-4 py-8 text-center text-[16px] ${lightChrome ? "text-slate-400" : "text-white/35"}`}>No members yet</div>
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
                    className={`w-full flex items-center gap-3 px-4 py-4 text-left transition-all min-h-[72px] ${
                      isSelected ? (lightChrome ? "bg-sky-50" : "bg-white/8") : lightChrome ? "hover:bg-slate-50" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className="h-12 w-12 rounded-full flex items-center justify-center text-[18px] font-bold text-white"
                        style={{ background: live ? member.color : "#334155" }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      {live && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[17px] font-semibold truncate ${lightChrome ? "text-slate-900" : "text-white"}`}>
                        {member.name}{isMe ? " (you)" : ""}
                      </p>
                      <p className={`text-[15px] truncate mt-0.5 ${lightChrome ? "text-slate-600" : "text-white/45"}`}>
                        {loc
                          ? live
                            ? `🟢 Live · ${timeAgo(loc.updatedAt)}`
                            : `⚪ ${timeAgo(loc.updatedAt)}`
                          : "No location shared"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold capitalize ${lightChrome ? "bg-slate-100 text-slate-600" : "bg-white/8 text-white/45"}`}>
                      {member.role}
                    </span>
                    {isSelected && <span className="shrink-0 text-sky-400 text-xs">●</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drawer collapsed button */}
        {!drawerOpen && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="absolute right-4 bottom-4 z-20 flex h-12 items-center gap-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-white/10 px-5 shadow-xl text-white text-[15px] font-bold"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {liveCount} live
          </button>
        )}
        </>
        ) : null}

        </div>

        <MobileTabBarNav activeTab="map" />
      </div>
    </>
  );
}

/* ─── Avatar DOM helper ──────────────────────────────────────── */
function buildAvatar(member: { name: string; color: string }, stale: boolean): HTMLElement {
  // Premium puck: color gradient ring → white gap → colored face, deep soft shadow
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
    "font-size:19px;font-weight:800;color:white;",
    "font-family:system-ui,sans-serif;letter-spacing:0.01em;",
    "text-shadow:0 1px 2px rgba(0,0,0,0.25);",
  ].join("");
  face.textContent = member.name.charAt(0).toUpperCase();
  gap.appendChild(face);
  ring.appendChild(gap);
  return ring;
}
