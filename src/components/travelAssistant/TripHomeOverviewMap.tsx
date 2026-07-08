"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import {
  attachMapStyleErrorFallback,
  buildOsmRasterFallbackStyle,
  directMaptilerTransformRequest,
  scheduleMapLoadFallback,
} from "@/lib/map/maptilerClient";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import { useMapUserViewport } from "@/lib/ui/useMapUserViewport";
import {
  AIRPORT_SOURCE,
  ROUTE_SOURCE,
  buildAirportGeoJson,
  buildRouteSegmentGeoJson,
  collectRouteMapPoints,
} from "@/lib/travelAssistant/tripRouteMapGeo";
import {
  HOTEL_STAY_SOURCE,
  HOTEL_STAY_LINE_SOURCE,
  buildHotelStayMapPoints,
  buildHotelStayPointGeoJson,
  buildHotelStayLineGeoJson,
  type HotelStayMapReservation,
} from "@/lib/travelAssistant/tripHotelStayMap";
import {
  buildTripTransportRoute,
  type TransportRouteReservation,
  type TripTransportSegment,
} from "@/lib/travelAssistant/tripTransportRoute";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

interface TripHomeOverviewMapProps {
  transportReservations: TransportRouteReservation[];
  hotelReservations: HotelStayMapReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  staySegments?: TripStaySegment[];
  onReservationTap?: (reservationId: string) => void;
  className?: string;
  /** Map tab: open centered on user GPS instead of fitting the whole trip. */
  preferUserLocation?: boolean;
}

function createAirportMarker(code: string, visitCount: number): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center pointer-events-none";
  wrap.style.zIndex = "10";

  const badge = document.createElement("div");
  badge.className =
    "rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow ring-1 ring-white/80";
  badge.textContent = code;

  const dot = document.createElement("div");
  dot.className = "mt-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-white";

  wrap.append(badge, dot);
  if (visitCount > 1) {
    const count = document.createElement("span");
    count.className = "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white";
    count.textContent = String(visitCount);
    badge.style.position = "relative";
    badge.append(count);
  }
  return wrap;
}

function createHotelMarker(label: string, booked: boolean, onClick: () => void): HTMLDivElement {
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.className = "flex flex-col items-center border-0 bg-transparent p-0 cursor-pointer";
  wrap.style.zIndex = booked ? "12" : "11";
  wrap.setAttribute("aria-label", `Hotel: ${label}`);
  wrap.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  const badge = document.createElement("div");
  badge.className = `max-w-[8rem] truncate rounded-lg px-2 py-0.5 text-[11px] font-black text-white shadow-lg ring-2 ${
    booked ? "bg-emerald-600 ring-emerald-300/80" : "bg-slate-500 ring-slate-300/60"
  }`;
  badge.textContent = label.length > 18 ? `${label.slice(0, 16)}…` : label;

  const dot = document.createElement("div");
  dot.className = `mt-0.5 h-3 w-3 rounded-full ring-2 ring-white/80 ${booked ? "bg-emerald-400" : "bg-slate-400"}`;

  wrap.append(badge, dot);
  return wrap;
}

export function TripHomeOverviewMap({
  transportReservations,
  hotelReservations,
  plannedFlightLegs = [],
  staySegments = [],
  onReservationTap,
  className = "",
  preferUserLocation = false,
}: TripHomeOverviewMapProps) {
  const route = useMemo(
    () => buildTripTransportRoute(transportReservations, plannedFlightLegs),
    [plannedFlightLegs, transportReservations],
  );
  const hotelPoints = useMemo(
    () => buildHotelStayMapPoints({ reservations: hotelReservations, staySegments }),
    [hotelReservations, staySegments],
  );

  const routeGeoJson = useMemo(() => buildRouteSegmentGeoJson(route.segments), [route.segments]);
  const airportGeoJson = useMemo(() => buildAirportGeoJson(collectRouteMapPoints(route.segments)), [route.segments]);
  const hotelGeoJson = useMemo(() => buildHotelStayPointGeoJson(hotelPoints), [hotelPoints]);
  const hotelLineGeoJson = useMemo(() => buildHotelStayLineGeoJson(hotelPoints), [hotelPoints]);

  const routeGeoJsonRef = useRef(routeGeoJson);
  const airportGeoJsonRef = useRef(airportGeoJson);
  const hotelGeoJsonRef = useRef(hotelGeoJson);
  const hotelLineGeoJsonRef = useRef(hotelLineGeoJson);
  routeGeoJsonRef.current = routeGeoJson;
  airportGeoJsonRef.current = airportGeoJson;
  hotelGeoJsonRef.current = hotelGeoJson;
  hotelLineGeoJsonRef.current = hotelLineGeoJson;

  const routeRef = useRef(route);
  routeRef.current = route;
  const hotelPointsRef = useRef(hotelPoints);
  hotelPointsRef.current = hotelPoints;
  const routePoints = useMemo(() => collectRouteMapPoints(route.segments), [route.segments]);
  const routePointsRef = useRef(routePoints);
  routePointsRef.current = routePoints;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const airportMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const hotelMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const usingOsmFallbackRef = useRef(false);
  const isLoadedRef = useRef(false);
  const userCenteredRef = useRef(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);

  const hasRouteGeo = routePoints.length >= 2;
  const hasHotels = hotelPoints.length > 0;
  const hasMap = hasRouteGeo || hasHotels;

  const { bindUserInteraction, allowManualFit } = useMapUserViewport();
  const unbindInteractionRef = useRef<(() => void) | null>(null);
  const onReservationTapRef = useRef(onReservationTap);
  onReservationTapRef.current = onReservationTap;

  useEffect(() => {
    void fetch("/api/config")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { maptilerKey?: string }) => {
        if (data.maptilerKey) setMaptilerKey(data.maptilerKey);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!preferUserLocation || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLon(pos.coords.longitude);
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [preferUserLocation]);

  const centerOnUser = useCallback(async (duration = 900) => {
    const map = mapRef.current;
    if (!map) return;
    const lat = userLat;
    const lon = userLon;
    if (lat == null || lon == null) return;
    map.easeTo({ center: [lon, lat], zoom: 14, duration, essential: true });
  }, [userLat, userLon]);

  const fitWholeTrip = useCallback(async (duration = 900) => {
    const map = mapRef.current;
    if (!map) return;
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    let extended = false;
    for (const point of routePointsRef.current) {
      bounds.extend([point.lon, point.lat]);
      extended = true;
    }
    for (const point of hotelPointsRef.current) {
      bounds.extend([point.lon, point.lat]);
      extended = true;
    }
    if (!extended) return;
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: routePointsRef.current.length + hotelPointsRef.current.length <= 3 ? 10 : 7,
      duration,
      essential: true,
    });
  }, []);

  const focusSegment = useCallback(async (segment: TripTransportSegment) => {
    const map = mapRef.current;
    if (!map || segment.lat == null || segment.lon == null || segment.toLat == null || segment.toLon == null) return;
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([segment.lon, segment.lat]);
    bounds.extend([segment.toLon, segment.toLat]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 700, essential: true });
  }, []);

  const installLayers = useCallback((map: import("maplibre-gl").Map) => {
    const routeData = routeGeoJsonRef.current;
    const airportData = airportGeoJsonRef.current;
    const staysData = hotelGeoJsonRef.current;
    const stayLinesData = hotelLineGeoJsonRef.current;

    if (!map.getSource(ROUTE_SOURCE)) {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData });
    } else {
      (map.getSource(ROUTE_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(routeData);
    }

    for (const [id, filter, paint] of [
      ["trip-home-route-unbooked", ["all", ["any", ["!", ["get", "booked"]], ["get", "dashed"]], ["!=", ["get", "status"], "conflict"]], { "line-color": "#94a3b8", "line-width": 4, "line-opacity": 0.95, "line-dasharray": [2, 2] }],
      ["trip-home-route-booked", ["all", ["get", "booked"], ["!", ["get", "dashed"]], ["!=", ["get", "status"], "conflict"]], { "line-color": ["get", "color"], "line-width": 3.5, "line-opacity": 0.95 }],
      ["trip-home-route-conflict", ["==", ["get", "status"], "conflict"], { "line-color": "#ef4444", "line-width": 5, "line-opacity": 1, "line-dasharray": [1.5, 1.5] }],
    ] as const) {
      if (!map.getLayer(id)) {
        map.addLayer({ id, type: "line", source: ROUTE_SOURCE, filter, paint });
      }
    }

    if (!map.getLayer("trip-home-route-hit")) {
      map.addLayer({
        id: "trip-home-route-hit",
        type: "line",
        source: ROUTE_SOURCE,
        paint: { "line-width": 16, "line-opacity": 0 },
      });
    }

    if (!map.getSource(AIRPORT_SOURCE)) {
      map.addSource(AIRPORT_SOURCE, { type: "geojson", data: airportData });
    } else {
      (map.getSource(AIRPORT_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(airportData);
    }

    if (!map.getLayer("trip-home-airport-glow")) {
      map.addLayer({
        id: "trip-home-airport-glow",
        type: "circle",
        source: AIRPORT_SOURCE,
        paint: {
          "circle-radius": 10,
          "circle-color": "#38bdf8",
          "circle-opacity": 0.25,
          "circle-stroke-width": 0,
        },
      });
    }

    if (!map.getSource(HOTEL_STAY_SOURCE)) {
      map.addSource(HOTEL_STAY_SOURCE, { type: "geojson", data: staysData });
    } else {
      (map.getSource(HOTEL_STAY_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(staysData);
    }

    if (!map.getSource(HOTEL_STAY_LINE_SOURCE)) {
      map.addSource(HOTEL_STAY_LINE_SOURCE, { type: "geojson", data: stayLinesData });
    } else {
      (map.getSource(HOTEL_STAY_LINE_SOURCE) as import("maplibre-gl").GeoJSONSource).setData(stayLinesData);
    }

    if (!map.getLayer("trip-home-stay-lines")) {
      map.addLayer({
        id: "trip-home-stay-lines",
        type: "line",
        source: HOTEL_STAY_LINE_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.85,
          "line-dasharray": ["case", ["get", "dashed"], ["literal", [2, 2]], ["literal", [1, 0]]],
        },
      });
    }

    if (!map.getLayer("trip-home-hotel-glow")) {
      map.addLayer({
        id: "trip-home-hotel-glow",
        type: "circle",
        source: HOTEL_STAY_SOURCE,
        paint: {
          "circle-radius": 12,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.28,
          "circle-stroke-width": 0,
        },
      });
    }
  }, []);

  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const maplibregl = await import("maplibre-gl");

    for (const marker of airportMarkersRef.current) marker.remove();
    airportMarkersRef.current = [];
    for (const point of routePointsRef.current) {
      const el = createAirportMarker(point.code, point.visitCount);
      airportMarkersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([point.lon, point.lat]).addTo(map),
      );
    }

    for (const marker of hotelMarkersRef.current) marker.remove();
    hotelMarkersRef.current = [];
    for (const point of hotelPointsRef.current) {
      const reservationId = point.reservationId;
      const el = createHotelMarker(point.city, point.booked, () => {
        if (reservationId && onReservationTapRef.current) {
          onReservationTapRef.current(reservationId);
          return;
        }
        map.flyTo({ center: [point.lon, point.lat], zoom: 14, duration: 700, essential: true });
      });
      hotelMarkersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([point.lon, point.lat]).addTo(map),
      );
    }
  }, []);

  const dataFingerprint = useMemo(
    () =>
      `${route.segments.map((s) => s.id).join("|")}::${hotelPoints.map((p) => p.id).join("|")}`,
    [route.segments, hotelPoints],
  );

  useEffect(() => {
    if (!hasMap || !containerRef.current) return;

    let cancelled = false;
    let clearLoadFallback: (() => void) | null = null;

    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      usingOsmFallbackRef.current = true;
      isLoadedRef.current = false;
      setMapReady(false);

      const seed = routePointsRef.current[0] ?? hotelPointsRef.current[0];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: buildOsmRasterFallbackStyle(),
        center: [seed?.lon ?? 0, seed?.lat ?? 22],
        zoom: 2,
        maxZoom: 18,
        pixelRatio: getMapPixelRatio(),
        attributionControl: false,
        fadeDuration: 0,
        ...(maptilerKey ? { transformRequest: directMaptilerTransformRequest(maptilerKey) } : {}),
      });
      const unbindResize = bindMapResize(containerRef.current, map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      mapRef.current = map;

      const finishMapLoad = (): void => {
        if (cancelled) return;
        installLayers(map);
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = bindUserInteraction(map);
        isLoadedRef.current = true;
        setMapReady(true);
        window.requestAnimationFrame(() => {
          try {
            map.resize();
          } catch {
            /* ignore */
          }
        });
        void renderMarkers();
        if (preferUserLocation && !userCenteredRef.current) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (userCenteredRef.current || !mapRef.current) return;
              userCenteredRef.current = true;
              setUserLat(pos.coords.latitude);
              setUserLon(pos.coords.longitude);
              mapRef.current.easeTo({
                center: [pos.coords.longitude, pos.coords.latitude],
                zoom: 14,
                duration: 900,
                essential: true,
              });
            },
            () => {
              void fitWholeTrip(0);
            },
            { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
          );
        } else {
          void fitWholeTrip(0);
        }
      };

      map.on("load", finishMapLoad);
      attachMapStyleErrorFallback(map, {
        isCancelled: () => cancelled,
        isLoaded: () => isLoadedRef.current,
        markLoaded: () => {
          isLoadedRef.current = true;
        },
        usingOsmFallback: usingOsmFallbackRef,
        onRecovered: finishMapLoad,
      });
      clearLoadFallback = scheduleMapLoadFallback(map, {
        isCancelled: () => cancelled,
        isLoaded: () => isLoadedRef.current,
        usingOsmFallback: usingOsmFallbackRef,
        onReady: finishMapLoad,
      });

      map.on("click", "trip-home-route-hit", (event) => {
        const segmentId = event.features?.[0]?.properties?.segmentId as string | undefined;
        if (!segmentId) return;
        const segment = routeRef.current.segments.find((s) => s.id === segmentId);
        if (!segment) return;
        if (segment.reservationId && onReservationTapRef.current) {
          onReservationTapRef.current(segment.reservationId);
        } else {
          void focusSegment(segment);
        }
      });
      map.on("mouseenter", "trip-home-route-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "trip-home-route-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("remove", () => {
        clearLoadFallback?.();
        unbindInteractionRef.current?.();
        unbindInteractionRef.current = null;
        unbindResize();
      });
    })();

    return () => {
      cancelled = true;
      clearLoadFallback?.();
      unbindInteractionRef.current?.();
      unbindInteractionRef.current = null;
      for (const marker of airportMarkersRef.current) marker.remove();
      airportMarkersRef.current = [];
      for (const marker of hotelMarkersRef.current) marker.remove();
      hotelMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      isLoadedRef.current = false;
      setMapReady(false);
    };
  }, [hasMap, maptilerKey, bindUserInteraction, fitWholeTrip, focusSegment, installLayers, renderMarkers, preferUserLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    installLayers(map);
    void renderMarkers();
    allowManualFit();
    if (preferUserLocation && userLat != null && userLon != null && !userCenteredRef.current) {
      userCenteredRef.current = true;
      void centerOnUser(400);
      return;
    }
    if (!preferUserLocation) {
      void fitWholeTrip(400);
    }
  }, [dataFingerprint, mapReady, installLayers, renderMarkers, fitWholeTrip, allowManualFit, preferUserLocation, userLat, userLon, centerOnUser]);

  if (!hasMap) {
    return (
      <div
        className={`flex items-center justify-center bg-[#dbeafe] px-6 text-center ${className}`}
      >
        <p className="text-sm font-medium text-slate-600">
          Add flights or hotels to see your trip on the map
        </p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="h-full w-full min-h-[inherit] bg-[#dbeafe]"
        role="application"
        aria-label="Trip map — drag to pan, pinch or scroll to zoom, tap flights and hotels"
      />
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => {
            allowManualFit();
            void fitWholeTrip();
          }}
          className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow ring-1 ring-black/10"
        >
          Fit whole trip
        </button>
      </div>
      {!mapReady ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#dbeafe]/80">
          <p className="text-sm font-semibold text-slate-600">Loading map…</p>
        </div>
      ) : null}
    </div>
  );
}
