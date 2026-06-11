"use client";

import {
  AirportNavigatorEngine,
  defaultSeaFlight,
  initialFixForAirport,
  type NavState,
} from "@/lib/airportNav/airportNavigatorEngine";
import { computeBoardingPressure, formatMinutesLabel } from "@/lib/airportNav/boardingPressure";
import type { AirportTerminal3DModel, FlightNavContext, VoiceNavIntent } from "@/lib/airportNav/types";
import { fixFromGps } from "@/lib/airportNav/positionFusion";
import { snapFixToGraph } from "@/lib/airportNav/pathfinder3d";
import {
  getAirportLayout,
  listSupportedAirports,
  normalizeAirportIata,
} from "@/lib/airportNav/layouts";
import { buildAirportMapStyle, proxyMaptilerRequest } from "@/components/airport/airportMapStyle";
import {
  configureMapLighting,
  countTerminalLayers,
  fitMapToTerminal,
  installTerminalLayers,
} from "@/components/airport/installTerminalLayers";
import { BubbleLayer, type PlacedBubble } from "@/components/airport/BubbleLayer";
import {
  describeUserLocation,
  fitMapToUserAndTerminal,
  UserLocationLayer,
} from "@/components/airport/UserLocationLayer";
import { VoiceDock } from "@/components/airport/VoiceDock";
import { WarmPathLayer } from "@/components/airport/WarmPathLayer";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";

export interface AirportNavigatorProps {
  iata: string;
  tripId?: string;
  flight?: FlightNavContext;
  className?: string;
}

const QUICK_DESTINATIONS = [
  { id: "poi-checkin-united", label: "Check-in" },
  { id: "poi-security", label: "Security" },
  { id: "poi-gate-b32", label: "My gate" },
  { id: "poi-lounge-centurion", label: "Lounge" },
] as const;

function placedBubbles(state: NavState, model: AirportTerminal3DModel | null): PlacedBubble[] {
  if (!model) return [];
  const poiById = new Map(model.pois.map((poi) => [poi.id, poi]));
  const nodeById = new Map(model.graph.nodes.map((node) => [node.id, node]));
  return state.bubbles.flatMap((bubble) => {
    const poi = poiById.get(bubble.poiId);
    if (!poi) return [];
    const node = nodeById.get(poi.nodeId);
    if (!node) return [];
    return [{ ...bubble, lng: node.pos.lng, lat: node.pos.lat }];
  });
}

function flightIdentity(flight: FlightNavContext): string {
  return `${flight.originIata}|${flight.flightNumber}|${flight.gateCode ?? ""}|${flight.airline}`;
}

function waitForContainerSize(
  container: HTMLElement,
  attempts = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (container.clientWidth >= 100 && container.clientHeight >= 100) {
      resolve();
      return;
    }
    if (attempts >= 40) {
      reject(new Error("Map container never received dimensions"));
      return;
    }
    requestAnimationFrame(() => {
      void waitForContainerSize(container, attempts + 1).then(resolve).catch(reject);
    });
  });
}

export function AirportNavigator({
  iata,
  tripId,
  flight: flightProp,
  className,
}: AirportNavigatorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const engineRef = useRef<AirportNavigatorEngine | null>(null);
  const modelRef = useRef<AirportTerminal3DModel | null>(null);
  const locatedOnceRef = useRef(false);

  const [navState, setNavState] = useState<NavState | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLib, setMapLib] = useState<typeof maplibregl | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  if (engineRef.current === null) {
    engineRef.current = new AirportNavigatorEngine({});
  }

  const flight = useMemo(
    () => flightProp ?? defaultSeaFlight(),
    [flightProp],
  );
  const flightKey = useMemo(() => flightIdentity(flight), [flight]);
  const flightRef = useRef(flight);
  flightRef.current = flight;

  const airportIata = useMemo(() => normalizeAirportIata(iata), [iata]);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl/dist/maplibre-gl.css");
    void import("@/lib/maplibreCspWorker");
    void import("maplibre-gl").then((module) => {
      if (!cancelled) setMapLib(module.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return undefined;
    return engine.subscribe((state) => {
      setNavState(state);
      if (state.subtitle) setStatusLine(state.subtitle);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDemoNotice(null);
    setMapReady(false);

    let model = getAirportLayout(airportIata);
    if (!model) {
      const fallback = getAirportLayout("SEA");
      if (fallback) {
        model = fallback;
        setDemoNotice(
          `${airportIata} is not in Phase 0 yet — showing Seattle (SEA) demo. Supported: ${listSupportedAirports().join(", ")}.`,
        );
      } else {
        setError(
          `Airport layout not available for ${airportIata}. Supported: ${listSupportedAirports().join(", ")}.`,
        );
        setLoading(false);
        return;
      }
    }

    modelRef.current = model;
    engineRef.current?.dispatch({ type: "LOAD_MODEL", model });
    engineRef.current?.dispatch({ type: "SET_FLIGHT", flight: flightRef.current });
    locatedOnceRef.current = false;
    setLayoutVersion((version) => version + 1);
    setStatusLine("Tap a destination below or press Guide Me to start.");
    setLoading(false);
  }, [airportIata, flightKey]);

  useEffect(() => {
    const model = modelRef.current;
    const container = containerRef.current;
    if (!mapLib || !model || !container || layoutVersion === 0) return undefined;

    let cancelled = false;
    let map: maplibregl.Map | null = null;

    const boot = async () => {
      try {
        await waitForContainerSize(container);
        if (cancelled || mapRef.current) return;

        map = new mapLib.Map({
          container,
          style: buildAirportMapStyle(),
          center: [model.center.lng, model.center.lat],
          zoom: 16.5,
          pitch: 58,
          bearing: -24,
          antialias: true,
          attributionControl: { compact: true },
          transformRequest: proxyMaptilerRequest,
        });
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled || !map) return;
          try {
            configureMapLighting(map);
            installTerminalLayers(map, model);
            fitMapToTerminal(map, mapLib, model);
            map.addControl(new mapLib.NavigationControl({ visualizePitch: true }), "top-right");
            map.resize();
            container.dataset.mapReady = "true";
            container.dataset.terminalLayers = String(countTerminalLayers(map));
            setMapReady(true);
          } catch (bootError) {
            console.error("Airport map boot failed:", bootError);
            setError("3D terminal map failed to initialize.");
          }
        });

        map.on("error", (event) => {
          console.warn("MapLibre warning:", event.error?.message ?? event);
        });
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : "Map failed to load");
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      delete container.dataset.mapReady;
      delete container.dataset.terminalLayers;
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapLib, layoutVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !mapReady || !container) return undefined;

    const resize = () => map.resize();
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("orientationchange", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, [mapReady]);

  const applyGpsPosition = useCallback(
    (position: GeolocationPosition, flyToUser = false) => {
      const model = modelRef.current;
      const map = mapRef.current;
      if (!model) return;

      const raw = fixFromGps(
        position.coords.longitude,
        position.coords.latitude,
        "L0",
        position.coords.accuracy,
      );
      const fix = snapFixToGraph(model, raw);
      engineRef.current?.dispatch({ type: "POSITION_FIX", fix });

      const offsite = !fix.snappedNodeId;
      if (offsite) {
        setStatusLine(describeUserLocation(fix, model, airportIata) ?? "Location updated.");
      } else {
        setStatusLine("You are at the terminal.");
      }

      if (map && mapLib && (flyToUser || !locatedOnceRef.current)) {
        if (offsite) {
          fitMapToUserAndTerminal(map, mapLib, model, fix);
        } else {
          fitMapToTerminal(map, mapLib, model);
        }
      }
      locatedOnceRef.current = true;
    },
    [airportIata, mapLib],
  );

  const requestUserLocation = useCallback(
    (flyToUser = false) => {
      if (!navigator.geolocation) {
        const model = modelRef.current;
        if (model) {
          engineRef.current?.dispatch({
            type: "POSITION_FIX",
            fix: initialFixForAirport(model),
          });
          setStatusLine("Location unavailable — showing demo position at the terminal.");
        }
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => applyGpsPosition(position, flyToUser),
        () => {
          const model = modelRef.current;
          if (model && !engineRef.current?.getState().fix) {
            engineRef.current?.dispatch({
              type: "POSITION_FIX",
              fix: initialFixForAirport(model),
            });
          }
          setStatusLine("Could not read GPS — tap My location to retry.");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    },
    [applyGpsPosition],
  );

  useEffect(() => {
    if (!mapReady) return undefined;
    requestUserLocation(true);
    return undefined;
  }, [mapReady, requestUserLocation]);

  const locationLine = useMemo(
    () => describeUserLocation(navState?.fix ?? null, navState?.model ?? null, airportIata),
    [navState?.fix, navState?.model, airportIata],
  );

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const model = modelRef.current;
    const fix = engineRef.current?.getState().fix;
    if (!map || !model || !mapLib) return;
    if (fix && !fix.snappedNodeId) {
      fitMapToUserAndTerminal(map, mapLib, model, fix);
    } else {
      fitMapToTerminal(map, mapLib, model);
    }
    setStatusLine("Recentered on terminal.");
  }, [mapLib]);

  const gatePoiId = useMemo(() => {
    const gateCode = flight.gateCode?.toUpperCase();
    const model = navState?.model;
    if (!gateCode || !model) return "poi-gate-b32";
    return model.pois.find((poi) => poi.gateCode?.toUpperCase() === gateCode)?.id ?? "poi-gate-b32";
  }, [flight.gateCode, navState?.model]);

  const quickDestinations = useMemo(
    () =>
      QUICK_DESTINATIONS.map((entry) =>
        entry.id === "poi-gate-b32" ? { ...entry, id: gatePoiId } : entry,
      ),
    [gatePoiId],
  );

  const placed = useMemo(
    () => (navState ? placedBubbles(navState, navState.model) : []),
    [navState],
  );

  const bpi = computeBoardingPressure({
    boardingCloseIso: flight.boardingCloseIso,
    walkSeconds: navState?.path?.totalSeconds ?? 540,
  });

  const goTo = useCallback((poiId: string) => {
    engineRef.current?.dispatch({ type: "NAVIGATE", poiId });
    setStatusLine("Routing…");
  }, []);

  const handleGuideMe = useCallback(() => {
    engineRef.current?.dispatch({ type: "GUIDE_NEXT" });
    setStatusLine("Finding your next step…");
  }, []);

  const handleVoiceIntent = useCallback((intent: VoiceNavIntent) => {
    engineRef.current?.dispatch({ type: "VOICE_INTENT", intent });
    if (intent.spokenResponse) setStatusLine(intent.spokenResponse);
  }, []);

  const handlePromptOption = useCallback(
    (option: NonNullable<NavState["pendingPrompt"]>["options"][number]) => {
      const action = option.action;
      if (action.type === "credentials") {
        engineRef.current?.dispatch({
          type: "SET_CREDENTIALS",
          credentials: { tsaPreCheck: action.tsaPreCheck, clear: action.clear },
        });
        engineRef.current?.dispatch({ type: "DISMISS_PROMPT" });
      } else if (action.type === "confirm_phase") {
        engineRef.current?.dispatch({ type: "CONFIRM_PHASE", phaseId: action.phaseId });
        engineRef.current?.dispatch({ type: "DISMISS_PROMPT" });
      } else if (action.type === "navigate") {
        goTo(action.poiId);
        engineRef.current?.dispatch({ type: "DISMISS_PROMPT" });
      } else {
        engineRef.current?.dispatch({ type: "DISMISS_PROMPT" });
      }
    },
    [goTo],
  );

  const handleLocateMe = useCallback(() => {
    requestUserLocation(true);
  }, [requestUserLocation]);

  const interactive = !loading && !error;

  return (
    <div
      className={cn(
        "relative h-[min(75vh,680px)] min-h-[480px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-[#0B1F3A] shadow-2xl",
        className,
      )}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 h-full w-full"
        data-testid="airport-nav-map"
        aria-hidden={!interactive}
      />

      {mapReady && mapRef.current && navState && mapLib ? (
        <>
          <UserLocationLayer
            map={mapRef.current}
            mapLib={mapLib}
            fix={navState.fix}
            model={navState.model}
            airportIata={airportIata}
          />
          <WarmPathLayer map={mapRef.current} path={navState.path} />
          <BubbleLayer
            map={mapRef.current}
            bubbles={placed}
            onTap={goTo}
          />
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-40 flex flex-col">
        <div className="p-4">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-300/80">
              Airport Navigator · {airportIata}
              {tripId ? ` · trip ${tripId.slice(0, 8)}` : ""}
            </p>
            {demoNotice ? (
              <p className="mt-1 text-xs text-amber-200/90">{demoNotice}</p>
            ) : null}
            <p className="mt-1 text-sm font-semibold text-white">
              {flight.flightNumber} · {flight.originIata} → {flight.destinationIata}
              {flight.gateCode ? ` · Gate ${flight.gateCode}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-300">
              {bpi.secondsRemaining !== null
                ? `Boarding closes in ${formatMinutesLabel(bpi.secondsRemaining)}`
                : "Boarding time syncing"}
              {" · Phase: "}
              {navState?.activePhase ?? "loading"}
            </p>
            {locationLine ? (
              <p className="mt-1 text-xs font-medium text-sky-200/90" data-testid="airport-nav-location">
                {locationLine}
              </p>
            ) : null}
          </div>

          <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
            {quickDestinations.map((dest) => (
              <button
                key={dest.id}
                type="button"
                disabled={!interactive}
                onClick={() => goTo(dest.id)}
                className="rounded-full border border-sky-400/40 bg-sky-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-40"
              >
                {dest.label}
              </button>
            ))}
            <button
              type="button"
              disabled={!interactive}
              onClick={handleRecenter}
              className="rounded-full border border-white/20 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              Recenter
            </button>
            <button
              type="button"
              disabled={!interactive}
              onClick={handleLocateMe}
              className="rounded-full border border-white/20 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              My location
            </button>
          </div>
        </div>

        <div className="mt-auto p-4 pb-20">
          {(statusLine || navState?.subtitle) ? (
            <div className="pointer-events-auto mb-3 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 backdrop-blur-md">
              {navState?.subtitle ?? statusLine}
            </div>
          ) : null}

          {!navState?.quietMode ? (
            <div className="pointer-events-auto space-y-3">
              {navState?.pendingPrompt ? (
                <div className="rounded-2xl border border-sky-400/30 bg-slate-900/95 p-3 backdrop-blur-md">
                  <p className="text-sm font-medium text-white">{navState.pendingPrompt.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {navState.pendingPrompt.options.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => handlePromptOption(option)}
                        className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="airport-nav-guide-me"
                  disabled={!interactive}
                  onClick={handleGuideMe}
                  className="w-full rounded-2xl bg-sky-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-sky-500 disabled:opacity-40"
                >
                  Guide Me — {navState?.path ? "Update route" : "Next step"}
                </button>
              )}
            </div>
          ) : (
            <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-center text-sm text-slate-200">
              Quiet mode — through security. Tap Security when you are out the other side.
            </div>
          )}
        </div>
      </div>

      <VoiceDock onIntent={handleVoiceIntent} disabled={!interactive} />

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/80 backdrop-blur-sm">
          <p className="text-sm text-slate-200">Loading terminal map…</p>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#0B1F3A]/95 p-6">
          <p className="text-center text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default AirportNavigator;
