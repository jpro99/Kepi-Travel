"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { bindMapResize, getMapPixelRatio } from "@/lib/map/maplibreInit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirportLayout, ComputedRoute, GraphEdge, PoiDefinition, SnappedPosition, TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { computeRoute, resolveGateNode, snapToGraph } from "@/lib/airportNav/pathfinder";
import { computeDirectionArrow, confirmedSnappedPosition } from "@/lib/airportNav/directionArrow";
import { computeLayoutBounds } from "@/lib/airportNav/layoutBounds";
import { buildAirportSchematicModel } from "@/lib/airportNav/schematic";
import type { JourneyWaypointEvent, NavTimingCalibrationStore } from "@/lib/airportNav/navTimingCalibration";
import { loadNavTimingCalibrationStore, recordJourneyWaypointPair } from "@/lib/airportNav/navJourneyTelemetry";
import {
  loadCachedAirportLayout,
  saveAirportLayoutToOfflineCache,
} from "@/lib/travelAssistant/syncItineraryOfflineAssets";
import { AirportNavigatorFallback } from "@/components/travelAssistant/AirportNavigatorFallback";
import {
  initialJourneyState,
  phaseStatusLine,
  stepJourney,
  type JourneyEvent,
  type JourneyPhaseId,
  type JourneyPrompt,
} from "@/lib/airportNav/journeyMachine";
import { routeVoiceIntent } from "@/lib/airportNav/intentRouter";
import { computeBoardingPressure, type BoardingPressure } from "@/lib/airportNav/boardingMath";
import type { FamilyAirportPin } from "@/lib/family/familyAirportPins";
import type { FamilyRally } from "@/lib/family/familyAirportSync";
import { OfficialAirportMapLink } from "@/components/travelAssistant/OfficialAirportMapLink";

/* ─────────────────────────────────────────────────────────────────────────
 * Kepi Airport Navigator — Phase 1 surface (spec §B/§C/§D4/§D5).
 * Phase 0: schematic 3D terminal, credential-gated routing, warm path.
 * Phase 1 adds: journey state machine (auto phase detection + honest
 * confirmation prompts), press-and-hold voice co-pilot with on-device
 * intent routing + TTS, haptic turn cues, lounge eligibility, leave-by
 * chip, and Quiet Mode at security.
 * ──────────────────────────────────────────────────────────────────────── */

interface AirportNavigatorMapProps {
  iata: string;
  /** e.g. "C11" — from the active flight reservation, may be unknown. */
  gateCode: string | null;
  airlineName: string | null;
  /** Flight hero card data — everything glanceable, zero hunting. */
  flightNumber?: string | null;
  arrivalAirport?: string | null;
  departureTerminal?: string | null;
  departureClockLabel?: string | null;
  flightStatusLabel?: string | null;
  flightDelayed?: boolean;
  /** "in-terminal" auto-expands the map to full screen once (auto-pop). */
  proximityStatus?: string;
  /** Explore terminal layout before travel day — no live GPS routing. */
  previewMode?: boolean;
  /** Fill the parent (Map page embed) — no card chrome, no expand button. */
  fill?: boolean;
  minutesToDeparture: number;
  userLat: number | null;
  userLon: number | null;
  userAccuracyM?: number | null;
  credentials: TravelerSecurityCredentials;
  onCredentialsAnswer: (creds: { tsaPreCheck: boolean; clear: boolean }) => void;
  /** Lounge names the traveler can access via airline status (AirportMode). */
  eligibleLoungeNames?: string[];
  /** Switch Live Map back to family GPS view (unsupported-airport fallback). */
  onSwitchToFamilyView?: () => void;
  /** Other family members at this airport (GPS-snapped to terminal graph when possible). */
  familyPins?: FamilyAirportPin[];
  onFamilyPinTap?: (memberId: string) => void;
  activeRally?: FamilyRally | null;
  /** Extra bottom offset when embedded above a fixed tab bar (e.g. /live-map). */
  shellBottomInset?: string;
}

const COLOR = {
  canvas: "#0b1f3a",
  landside: "#27405f",
  airside: "#1d3557",
};

const PATH_DIM = "#3b4f6b";
const PATH_WARM = "#f4c95d";
const PATH_WARM_BRIGHT = "#ffe29a";

/** Schematic terminal zones, walkways, and route layers — idempotent for load-race retries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installAirportLayoutLayers(map: any, lay: AirportLayout): void {
  if (!map.isStyleLoaded() || map.getSource("kepi-zones")) return;

  const zoneFeatures = lay.zones.map((zone) => ({
    type: "Feature" as const,
    properties: { height: zone.heightM, airside: zone.airside ? 1 : 0, name: zone.name },
    geometry: { type: "Polygon" as const, coordinates: [zone.ring] },
  }));
  map.addSource("kepi-zones", { type: "geojson", data: { type: "FeatureCollection", features: zoneFeatures } });
  map.addLayer({
    id: "kepi-zones-3d",
    type: "fill-extrusion",
    source: "kepi-zones",
    paint: {
      "fill-extrusion-color": ["case", ["==", ["get", "airside"], 1], COLOR.airside, COLOR.landside],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 0.85,
    },
  });

  const nodePos = new Map(lay.nodes.map((node) => [node.id, node.pos]));
  const walkFeatures = lay.edges
    .filter((edge) => edge.kind !== "security_transition")
    .map((edge) => ({
      type: "Feature" as const,
      properties: { train: edge.kind === "train" ? 1 : 0 },
      geometry: {
        type: "LineString" as const,
        coordinates: [nodePos.get(edge.from) ?? [0, 0], nodePos.get(edge.to) ?? [0, 0]],
      },
    }));
  map.addSource("kepi-walkways", { type: "geojson", data: { type: "FeatureCollection", features: walkFeatures } });
  map.addLayer({
    id: "kepi-walkways-line",
    type: "line",
    source: "kepi-walkways",
    paint: {
      "line-color": ["case", ["==", ["get", "train"], 1], "#5a7ba6", "#33507a"],
      "line-width": 2,
      "line-opacity": 0.55,
      "line-dasharray": [1, 2],
    },
  });

  map.addSource("kepi-route", {
    type: "geojson",
    lineMetrics: true,
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "kepi-route-glow",
    type: "line",
    source: "kepi-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": PATH_WARM,
      "line-width": 16,
      "line-blur": 8,
      "line-opacity": 0.3,
    },
  });
  map.addLayer({
    id: "kepi-route-line",
    type: "line",
    source: "kepi-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 6,
      "line-opacity": 0.95,
      "line-gradient": [
        "interpolate", ["linear"], ["line-progress"],
        0, PATH_WARM,
        1, PATH_WARM_BRIGHT,
      ],
    },
  });
}

function findEdgeBetween(layout: AirportLayout, fromId: string, toId: string): GraphEdge | null {
  return (
    layout.edges.find(
      (edge) =>
        (edge.from === fromId && edge.to === toId) ||
        (edge.bidirectional && edge.from === toId && edge.to === fromId),
    ) ?? null
  );
}

const POI_ICON: Record<PoiDefinition["category"], string> = {
  gate: "🛫",
  checkin: "🧳",
  security: "🛡",
  lounge: "🛋",
  restroom: "🚻",
  train: "🚈",
  baggage: "🎒",
};

type AirportDetailMode = "essentials" | "lounges" | "all";

function airportPoiIsVisible(
  definition: PoiDefinition,
  mode: AirportDetailMode,
  airlineName: string | null,
  gatePoiId: string | null,
  hasAirlineCheckin: boolean,
): boolean {
  if (definition.category === "checkin") {
    if (definition.airline) {
      if (!airlineName?.toLowerCase().includes(definition.airline.toLowerCase())) return false;
    } else if (hasAirlineCheckin) {
      return false;
    }
  }
  if (definition.id === gatePoiId) return true;
  if (mode === "essentials") return ["gate", "checkin", "security", "train"].includes(definition.category);
  if (mode === "lounges") return ["gate", "security", "train", "lounge"].includes(definition.category);
  return true;
}

interface AirportDestinationRailProps {
  layout: AirportLayout;
  airlineName: string | null;
  gatePoiId: string | null;
  gateCode: string | null;
  selectedPoiId: string | null;
  credentials: TravelerSecurityCredentials;
  hasApproximatePosition: boolean;
  onPoiClick: (poiId: string) => void;
}

function AirportDestinationRail({
  layout,
  airlineName,
  gatePoiId,
  gateCode,
  selectedPoiId,
  credentials,
  hasApproximatePosition,
  onPoiClick,
}: AirportDestinationRailProps) {
  const [detailMode, setDetailMode] = useState<AirportDetailMode>("essentials");
  const hasAirlineCheckin = layout.pois.some((definition) =>
    definition.category === "checkin"
    && Boolean(definition.airline)
    && Boolean(airlineName?.toLowerCase().includes(definition.airline!.toLowerCase())),
  );
  const visiblePois = layout.pois.filter((definition) =>
    airportPoiIsVisible(definition, detailMode, airlineName, gatePoiId, hasAirlineCheckin),
  );

  return (
    <section
      aria-label="Airport destinations"
      className="absolute bottom-24 right-2 top-36 z-[25] flex w-[42%] max-w-[190px] flex-col overflow-hidden rounded-[22px] bg-white/95 p-2.5 shadow-2xl backdrop-blur-md sm:right-4 sm:w-52 sm:max-w-none"
    >
      <div>
        <p className="text-[15px] font-black leading-tight text-[#0b1f3a]">
          {selectedPoiId ? "Choose another stop" : "Where to?"}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-black text-sky-800">
            {credentials.known
              ? [credentials.clear ? "CLEAR" : null, credentials.tsaPreCheck ? "PreCheck" : null]
                  .filter(Boolean)
                  .join(" + ") || "Standard security"
              : "Security profile not set"}
          </span>
          {hasApproximatePosition ? (
            <span className="rounded-full bg-sky-600 px-2 py-1 text-[9px] font-black text-white">
              ● You · approximate
            </span>
          ) : (
            <span className="rounded-full bg-slate-200 px-2 py-1 text-[9px] font-black text-slate-600">
              Preview starts at terminal entrance
            </span>
          )}
        </div>
        {credentials.clear ? (
          <p className="mt-1 text-[9px] font-semibold leading-tight text-amber-700">
            CLEAR locations and hours change. Confirm in the official live map below.
          </p>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {([
          ["essentials", "Main"],
          ["lounges", "Lounge"],
          ["all", "All"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={detailMode === mode}
            onClick={() => setDetailMode(mode)}
            className={`min-h-[36px] rounded-lg px-1 text-[10px] font-bold transition ${
              detailMode === mode ? "bg-[#0b1f3a] text-white shadow-sm" : "text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 touch-pan-y [-webkit-overflow-scrolling:touch]">
        {visiblePois.map((definition) => {
          const isGate = definition.id === gatePoiId;
          const selected = definition.id === selectedPoiId;
          const label = isGate && gateCode ? `Gate ${gateCode.toUpperCase()}` : definition.name;
          const laneSummary = definition.category === "security"
            ? definition.lanes
                ?.filter((lane) => lane !== "standard")
                .map((lane) => lane === "precheck" ? "PreCheck" : lane === "clear" ? "CLEAR" : lane)
                .join(" · ")
            : null;
          return (
            <button
              key={definition.id}
              type="button"
              aria-label={`Navigate to ${label}`}
              data-testid={`airport-nav-destination-${definition.id}`}
              aria-pressed={selected}
              onClick={() => onPoiClick(definition.id)}
              className={`min-h-[48px] w-full rounded-xl px-2 py-2 text-left text-[12px] font-bold leading-tight ring-1 active:scale-[0.98] ${
                selected
                  ? "bg-[#f4c95d] text-[#0b1f3a] ring-[#f4c95d]"
                  : "bg-slate-100 text-[#0b1f3a] ring-slate-200"
              }`}
            >
              <span className="mr-1" aria-hidden>{POI_ICON[definition.category]}</span>
              {label}
              {laneSummary ? <span className="mt-1 block text-[9px] font-semibold text-sky-800">{laneSummary}</span> : null}
            </button>
          );
        })}
      </div>
      <OfficialAirportMapLink
        iata={layout.iata}
        compact
        hasOfflineKepiLayout
        className="mt-2 shrink-0"
      />
    </section>
  );
}

interface AirportSchematicLayerProps {
  layout: AirportLayout;
  activeRoute: ComputedRoute | null;
  selectedPoiId: string | null;
  snapped: SnappedPosition | null;
  userAccuracyM: number | null;
  familyPins: FamilyAirportPin[];
  airlineName: string | null;
  gatePoiId: string | null;
  gateCode: string | null;
  minutesToDeparture: number;
  onPoiClick: (poiId: string) => void;
}

function AirportSchematicLayer({
  layout,
  activeRoute,
  selectedPoiId,
  snapped,
  userAccuracyM,
  familyPins,
  airlineName,
  gatePoiId,
  gateCode,
  minutesToDeparture,
  onPoiClick,
}: AirportSchematicLayerProps) {
  const model = useMemo(() => buildAirportSchematicModel(layout), [layout]);
  const hasAirlineCheckin = model.pois.some(({ definition }) =>
    definition.category === "checkin"
    && Boolean(definition.airline)
    && Boolean(airlineName?.toLowerCase().includes(definition.airline!.toLowerCase())),
  );
  const visiblePois = useMemo(
    () => model.pois.filter(({ definition }) =>
      airportPoiIsVisible(definition, "all", airlineName, gatePoiId, hasAirlineCheckin),
    ),
    [airlineName, gatePoiId, hasAirlineCheckin, model.pois],
  );
  const selectedPoi = visiblePois.find(({ definition }) => definition.id === selectedPoiId) ?? null;
  const routePoints = activeRoute?.coordinates
    .map((coordinate) => model.project(coordinate))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <div
      data-testid="airport-nav-schematic"
      data-zone-count={model.zones.length}
      className="absolute inset-0 z-[1] overflow-hidden bg-[#0b1f3a]"
    >
      <svg
        aria-label={`${layout.iata} terminal schematic`}
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="kepi-terminal-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#020617" floodOpacity="0.65" />
          </filter>
          <linearGradient id="kepi-terminal-route" x1="0" x2="1">
            <stop offset="0" stopColor={PATH_WARM} />
            <stop offset="1" stopColor={PATH_WARM_BRIGHT} />
          </linearGradient>
        </defs>

        {model.zones.map((zone) => (
          <g key={zone.id}>
            <polygon
              points={zone.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill={zone.airside ? "#36577e" : "#496680"}
              stroke={zone.airside ? "#7ea5cc" : "#8ca5bb"}
              strokeWidth="0.45"
              filter="url(#kepi-terminal-shadow)"
            />
            <text
              x={zone.label.x}
              y={zone.label.y}
              fill="#dbeafe"
              fontSize="2.05"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {zone.name}
            </text>
          </g>
        ))}

        {model.walkways.map((walkway) => (
          <line
            key={walkway.id}
            x1={walkway.from.x}
            y1={walkway.from.y}
            x2={walkway.to.x}
            y2={walkway.to.y}
            stroke={walkway.train ? "#9cc5ef" : "#7b9fc7"}
            strokeWidth={walkway.train ? "1.1" : "0.7"}
            strokeDasharray={walkway.train ? "1.5 1" : undefined}
            strokeLinecap="round"
            opacity="0.9"
          />
        ))}

        {routePoints ? (
          <g>
            <polyline
              points={routePoints}
              fill="none"
              stroke="#f4c95d"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.2"
            />
            <polyline
              data-testid="airport-nav-schematic-route"
              points={routePoints}
              fill="none"
              stroke="url(#kepi-terminal-route)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ) : null}

        {snapped ? (
          <g data-testid="airport-nav-schematic-user">
            <title>
              {`Your approximate location${userAccuracyM ? `, GPS accuracy about ${Math.round(userAccuracyM)} meters` : ""}`}
            </title>
            <circle
              cx={model.project(snapped.pos).x}
              cy={model.project(snapped.pos).y}
              r={Math.min(8, Math.max(4.5, (userAccuracyM ?? 35) / 12))}
              fill="rgba(56,189,248,0.16)"
              stroke="rgba(125,211,252,0.65)"
              strokeWidth="0.5"
            />
            <circle
              cx={model.project(snapped.pos).x}
              cy={model.project(snapped.pos).y}
              r="2.5"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
            <text
              x={model.project(snapped.pos).x}
              y={model.project(snapped.pos).y + 5}
              fill="#ffffff"
              fontSize="2"
              fontWeight="800"
              textAnchor="middle"
            >
              YOU
            </text>
          </g>
        ) : null}

        {familyPins.map((pin) => {
          const point = model.project([pin.lon, pin.lat]);
          return (
            <circle
              key={pin.memberId}
              cx={point.x}
              cy={point.y}
              r="1.25"
              fill={pin.color}
              stroke="#ffffff"
              strokeWidth="0.45"
              opacity={pin.stale ? "0.55" : "1"}
            />
          );
        })}

        {visiblePois.map(({ definition, point }) => {
          const isGate = definition.id === gatePoiId;
          const isSelected = definition.id === selectedPoiId;
          return (
            <circle
              key={definition.id}
              cx={point.x}
              cy={point.y}
              r={isSelected ? "1.55" : isGate ? "1.15" : "0.8"}
              fill={isGate || isSelected ? "#f4c95d" : "#f8fafc"}
              stroke={isSelected ? "#ffffff" : "#0b1f3a"}
              strokeWidth={isSelected ? "0.7" : "0.35"}
            />
          );
        })}

        {selectedPoi ? (() => {
          const { definition, point } = selectedPoi;
          const isGate = definition.id === gatePoiId;
          const label = isGate && gateCode ? `Gate ${gateCode.toUpperCase()}` : definition.name;
          const countdown = isGate && minutesToDeparture > 0 && minutesToDeparture < 600
            ? ` · ${Math.max(1, Math.round(minutesToDeparture))}m`
            : "";
          const displayLabel = `${POI_ICON[definition.category]} ${label}${countdown}`;
          const labelWidth = Math.min(34, Math.max(18, displayLabel.length * 0.98 + 5));
          const labelX = point.x >= 50
            ? Math.max(18, point.x - 18)
            : Math.min(82, point.x + 18);
          const labelY = Math.min(78, Math.max(18, point.y));
          const elbowX = point.x >= 50 ? labelX + labelWidth / 2 + 2 : labelX - labelWidth / 2 - 2;
          return (
            <g data-testid="airport-nav-selected-label">
              <polyline
                points={`${point.x},${point.y} ${elbowX},${point.y} ${elbowX},${labelY} ${labelX},${labelY}`}
                fill="none"
                stroke="#f4c95d"
                strokeWidth="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g transform={`translate(${labelX} ${labelY})`}>
                <rect
                  x={-labelWidth / 2}
                  y="-3.5"
                  width={labelWidth}
                  height="7"
                  rx="3.5"
                  fill="#f4c95d"
                  stroke="#fff3bd"
                  strokeWidth="0.55"
                  filter="url(#kepi-terminal-shadow)"
                />
                <text
                  x="0"
                  y="0.2"
                  fill="#0b1f3a"
                  fontSize="2"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {displayLabel}
                </text>
              </g>
            </g>
          );
        })() : null}
      </svg>

    </div>
  );
}

function isAirsidePoi(poi: PoiDefinition): boolean {
  return poi.category !== "checkin";
}

function fmtMins(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function fmtClock(ms: number): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

/** Cumulative meters along a route up to (and including) a given node id. */
function metersAlongRoute(route: ComputedRoute, nodeId: string): number | null {
  const idx = route.nodeIds.indexOf(nodeId);
  if (idx < 0) return null;
  if (idx === 0) return 0;
  // Instructions carry atMeters checkpoints; approximate via fraction of total.
  return (idx / (route.nodeIds.length - 1)) * route.totalMeters;
}

function loungeIsEligible(poiName: string, eligibleNames: string[]): boolean {
  const target = poiName.toLowerCase();
  return eligibleNames.some((name) => {
    const candidate = name.toLowerCase();
    return target.includes(candidate) || candidate.includes(target.split(" (")[0]);
  });
}

/**
 * Phone compass heading (deg, 0 = north, clockwise). Null until we get a real
 * reading — we never fake facing. iOS needs an explicit permission tap.
 */
function useDeviceHeading(active: boolean): {
  heading: number | null;
  needsPermission: boolean;
  requestPermission: () => void;
} {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orientationEvent = window.DeviceOrientationEvent as any;
    if (!orientationEvent) return;
    if (typeof orientationEvent.requestPermission === "function" && !granted) {
      setNeedsPermission(true);
    }
  }, [granted]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orientationEvent = window.DeviceOrientationEvent as any;
    if (!orientationEvent) return;
    if (typeof orientationEvent.requestPermission === "function" && !granted) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (event: any) => {
      const iosHeading = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : null;
      if (iosHeading != null && Number.isFinite(iosHeading)) {
        setHeading(iosHeading);
        return;
      }
      if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
        // alpha is counter-clockwise from north; convert to clockwise compass.
        setHeading((360 - event.alpha) % 360);
      }
    };
    window.addEventListener("deviceorientationabsolute", handler, true);
    window.addEventListener("deviceorientation", handler, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler, true);
      window.removeEventListener("deviceorientation", handler, true);
    };
  }, [active, granted]);

  const requestPermission = useCallback(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orientationEvent = window.DeviceOrientationEvent as any;
    if (orientationEvent && typeof orientationEvent.requestPermission === "function") {
      orientationEvent
        .requestPermission()
        .then((state: string) => {
          if (state === "granted") {
            setGranted(true);
            setNeedsPermission(false);
          }
        })
        .catch(() => undefined);
    } else {
      setGranted(true);
      setNeedsPermission(false);
    }
  }, []);

  return { heading, needsPermission, requestPermission };
}

export function AirportNavigatorMap({
  iata,
  gateCode,
  airlineName,
  minutesToDeparture,
  userLat,
  userLon,
  userAccuracyM = null,
  credentials,
  onCredentialsAnswer,
  eligibleLoungeNames = [],
  flightNumber = null,
  arrivalAirport = null,
  departureTerminal = null,
  departureClockLabel = null,
  flightStatusLabel = null,
  flightDelayed = false,
  proximityStatus = "away",
  previewMode = false,
  fill = false,
  onSwitchToFamilyView,
  familyPins = [],
  onFamilyPinTap,
  activeRally = null,
  shellBottomInset,
}: AirportNavigatorMapProps) {
  const bottomPanel = shellBottomInset ?? "max(0.75rem, env(safe-area-inset-bottom))";
  const bottomMic = shellBottomInset
    ? `calc(${shellBottomInset} + 3.25rem)`
    : "max(4rem, calc(env(safe-area-inset-bottom) + 3.25rem))";
  const bottomFamily = shellBottomInset
    ? `calc(${shellBottomInset} + 12rem)`
    : "max(5.5rem, calc(env(safe-area-inset-bottom) + 4.75rem))";
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poiMarkersRef = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyMarkersRef = useRef<Record<string, any>>({});

  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [layoutStatus, setLayoutStatus] = useState<"loading" | "ready" | "unsupported" | "error">("loading");
  const [mapReady, setMapReady] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ComputedRoute | null>(null);
  const [activeDestName, setActiveDestName] = useState<string | null>(null);
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);
  // The tapped destination stays highlighted even if a route can't be computed
  // yet — fixes the "label disappears the instant you tap it" flicker.
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  // Tap-to-confirm "I'm here": when set, overrides GPS snapping (positionFusion
  // grants user_confirmed the top confidence grade — this is the UI gesture).
  const [confirmMode, setConfirmMode] = useState(false);
  const [confirmedNodeId, setConfirmedNodeId] = useState<string | null>(null);

  // Journey machine (single source of truth for "where in the journey")
  const journeyRef = useRef(initialJourneyState(Date.now()));
  const lastWaypointRef = useRef<JourneyWaypointEvent | null>(null);
  const activeRouteRef = useRef<ComputedRoute | null>(null);
  const [navCalibration, setNavCalibration] = useState<NavTimingCalibrationStore | null>(null);
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhaseId>("landside");
  const quietMode = !previewMode && journeyPhase === "security";
  const [journeyPrompt, setJourneyPrompt] = useState<JourneyPrompt | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [objective, setObjective] = useState<"checkin" | "security" | "gate" | "lounge" | null>(null);

  // Voice co-pilot
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false); // TTS unlocked by first mic use
  const voiceOnRef = useRef(false);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Instruction progress (haptics + spoken turns)
  const lastInstructionIdxRef = useRef(-1);
  // State mirror of the instruction index — rendering must not read the ref.
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // Sprint Mode (spec §B Flow 6) — brisk-pace routing when running late
  const [sprint, setSprint] = useState(false);
  const sprintRef = useRef(false);
  const sprintSuggestedRef = useRef(false);
  const setSprintMode = useCallback((on: boolean) => {
    sprintRef.current = on;
    setSprint(on);
  }, []);

  // Full-screen map (auto-pops once on entering the terminal; ✕ to leave,
  // tap the card to come back — the map is always one tap away)
  const [expanded, setExpanded] = useState(false);
  const autoPoppedRef = useRef(false);
  const [heroOpen, setHeroOpen] = useState(true);
  useEffect(() => {
    if (previewMode && fill) {
      setExpanded(true);
      return;
    }
    if (proximityStatus === "in-terminal" && !autoPoppedRef.current) {
      autoPoppedRef.current = true;
      setExpanded(true);
    }
  }, [proximityStatus, previewMode, fill]);
  // MapLibre must re-measure its container when the card resizes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(timer);
  }, [expanded]);

  // Rebuild-sensitive values rounded so per-second parent ticks don't thrash markers
  const minutesRounded = Math.round(minutesToDeparture);

  /* ── Speech helpers ─────────────────────────────────────────────────── */
  const showSubtitle = useCallback((text: string) => {
    setSubtitle(text);
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = setTimeout(() => setSubtitle(null), 8000);
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current) return;
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* TTS is best-effort — never break navigation */
    }
  }, []);

  const sayAndShow = useCallback(
    (text: string) => {
      showSubtitle(text);
      speak(text);
    },
    [showSubtitle, speak],
  );

  const haptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(40);
    } catch {
      /* best-effort */
    }
    // Capacitor haptics on native builds — dynamic, never blocks web
    void import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => null);
  }, []);

  useEffect(() => {
    void loadNavTimingCalibrationStore().then(setNavCalibration).catch(() => null);
  }, []);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  /* ── Journey event processing ───────────────────────────────────────── */
  const processJourneyEvent = useCallback(
    (event: JourneyEvent) => {
      if (!layout) return;
      const prevState = journeyRef.current;
      const result = stepJourney(layout, prevState, event);
      journeyRef.current = result.state;
      setJourneyPhase(result.state.phase);
      if (result.prompt) setJourneyPrompt(result.prompt);
      else if (result.state.openPromptId === null) setJourneyPrompt(null);
      if (result.announce) {
        setStatusLine(result.announce);
        sayAndShow(result.announce);
      }
      if (result.suggestObjective) setObjective(result.suggestObjective);

      const nextNodeId = result.state.lastNodeId;
      if (
        nextNodeId &&
        (nextNodeId !== prevState.lastNodeId || result.state.phase !== prevState.phase)
      ) {
        const edge =
          prevState.lastNodeId && nextNodeId
            ? findEdgeBetween(layout, prevState.lastNodeId, nextNodeId)
            : null;
        const nextWaypoint: JourneyWaypointEvent = {
          id: `${iata}:${nextNodeId}:${result.state.phase}:${Date.now()}`,
          tripId: iata,
          airportIata: iata,
          nodeId: nextNodeId,
          edgeId: edge?.id,
          phase: result.state.phase,
          at: Date.now(),
        };
        void recordJourneyWaypointPair({
          previous: lastWaypointRef.current,
          next: nextWaypoint,
          curatedEdgeSeconds: edge?.traverseSeconds,
          securityLaneId:
            prevState.phase === "security" && result.state.phase !== "security"
              ? activeRouteRef.current?.laneUsed
              : undefined,
        })
          .then(setNavCalibration)
          .catch(() => null);
        lastWaypointRef.current = nextWaypoint;
      }
    },
    [iata, layout, sayAndShow],
  );

  /* ── Load curated layout (IndexedDB cache first, then API) ──────────── */
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setLayoutStatus("loading");
    void (async () => {
      const cached = await loadCachedAirportLayout(iata);
      if (cached && !cancelled) {
        setLayout(cached);
        setLayoutStatus("ready");
      }
      try {
        const res = await fetch(`/api/airport-nav/${encodeURIComponent(iata)}/layout`);
        if (res.status === 404) {
          if (!cancelled && !cached) setLayoutStatus("unsupported");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AirportLayout;
        if (!cancelled) {
          setLayout(data);
          setLayoutStatus("ready");
          void saveAirportLayoutToOfflineCache({
            tripId: "airport-nav",
            layout: data,
          });
        }
      } catch {
        const fallback = await loadCachedAirportLayout(iata);
        if (!cancelled) {
          if (fallback) {
            setLayout(fallback);
            setLayoutStatus("ready");
          } else {
            setLayoutStatus("error");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [iata]);

  /* ── Snapped traveler position ──────────────────────────────────────── */
  const snapped: SnappedPosition | null = useMemo(() => {
    if (!layout || previewMode) return null;
    // A user-confirmed "I'm here" tap wins over noisy indoor GPS.
    if (confirmedNodeId) {
      const node = layout.nodes.find((entry) => entry.id === confirmedNodeId);
      if (node) return confirmedSnappedPosition(node);
    }
    if (userLat === null || userLon === null) return null;
    return snapToGraph(layout, userLon, userLat, userAccuracyM);
  }, [layout, previewMode, confirmedNodeId, userLat, userLon, userAccuracyM]);

  const originNodeId = useMemo(() => {
    if (snapped && !previewMode) return snapped.nearestNodeId;
    if (!layout) return null;
    return layout.nodes.find((node) => node.kind === "junction" && !node.airside)?.id
      ?? layout.nodes[0]?.id
      ?? null;
  }, [snapped, layout, previewMode]);

  const gatePoi: PoiDefinition | null = useMemo(() => {
    if (!layout || !gateCode) return null;
    const gateNodeId = resolveGateNode(layout, gateCode);
    if (!gateNodeId) return null;
    return layout.pois.find((poi) => poi.category === "gate" && poi.nodeId === gateNodeId) ?? null;
  }, [layout, gateCode]);

  /* ── Routing ────────────────────────────────────────────────────────── */
  const startRoute = useCallback(
    (poiId: string, viaVoice = false) => {
      if (!layout || !originNodeId) return;
      const targetPoi = layout.pois.find((poi) => poi.id === poiId);
      if (!targetPoi) return;
      // Highlight the tapped destination immediately, regardless of routing outcome.
      setSelectedPoiId(poiId);
      if (isAirsidePoi(targetPoi) && !credentials.known && !journeyRef.current.throughSecurity) {
        setPendingPoiId(poiId);
        if (viaVoice) sayAndShow("Quick one — do you have TSA PreCheck, CLEAR, or both?");
        return;
      }
      const route = computeRoute({
        layout,
        fromNodeId: originNodeId,
        toPoiId: poiId,
        credentials,
        calibration: navCalibration ?? undefined,
        profile: sprintRef.current ? "sprint" : "default",
      });
      setActiveRoute(route);
      setActiveDestName(route ? targetPoi.name : null);
      setShowInstructions(false);
      lastInstructionIdxRef.current = -1;
      setCurrentStepIdx(0);
      if (route && viaVoice) {
        const first = route.instructions[0];
        sayAndShow(`${targetPoi.name} — ${fmtMins(route.totalSeconds)}. ${first ? first.text : ""}`);
      }
    },
    [layout, originNodeId, credentials, navCalibration, sayAndShow],
  );

  const endRoute = useCallback(() => {
    setActiveRoute(null);
    setActiveDestName(null);
    setSelectedPoiId(null);
    lastInstructionIdxRef.current = -1;
    setCurrentStepIdx(0);
  }, []);

  // Tap on a POI: in confirm mode, lock the traveler's position to that POI's
  // node; otherwise start routing there. Reads confirm mode from a ref so the
  // MapLibre marker bindings never capture a stale closure.
  const confirmModeRef = useRef(false);
  useEffect(() => {
    confirmModeRef.current = confirmMode;
  }, [confirmMode]);
  const handlePoiTap = useCallback(
    (poiId: string) => {
      if (confirmModeRef.current && layout) {
        const poi = layout.pois.find((entry) => entry.id === poiId);
        if (poi) {
          setConfirmedNodeId(poi.nodeId);
          setConfirmMode(false);
        }
        return;
      }
      startRoute(poiId);
    },
    [layout, startRoute],
  );

  const answerCredentials = useCallback(
    (tsaPreCheck: boolean, clear: boolean) => {
      onCredentialsAnswer({ tsaPreCheck, clear });
    },
    [onCredentialsAnswer],
  );

  // When credentials become known and a destination is pending, route to it.
  useEffect(() => {
    if (!credentials.known || !pendingPoiId || !layout || !originNodeId) return;
    const targetPoi = layout.pois.find((poi) => poi.id === pendingPoiId);
    setPendingPoiId(null);
    if (!targetPoi) return;
    const route = computeRoute({
      layout,
      fromNodeId: originNodeId,
      toPoiId: targetPoi.id,
      credentials,
      calibration: navCalibration ?? undefined,
    });
    setActiveRoute(route);
    setActiveDestName(route ? targetPoi.name : null);
    lastInstructionIdxRef.current = -1;
    setCurrentStepIdx(0);
  }, [credentials, pendingPoiId, layout, originNodeId, navCalibration]);

  // Re-route from new position as the traveler moves
  useEffect(() => {
    if (!activeRoute || !layout || !originNodeId) return;
    if (activeRoute.fromNodeId === originNodeId) return;
    const route = computeRoute({
      layout,
      fromNodeId: originNodeId,
      toPoiId: activeRoute.toPoiId,
      credentials,
      calibration: navCalibration ?? undefined,
      profile: sprintRef.current ? "sprint" : "default",
    });
    if (route) setActiveRoute(route);
  }, [originNodeId, activeRoute, layout, credentials, navCalibration, sprint]);

  /* ── Journey: position + clock events ───────────────────────────────── */
  useEffect(() => {
    if (!snapped || previewMode) return;
    processJourneyEvent({
      type: "position",
      nodeId: snapped.nearestNodeId,
      confidence: snapped.confidence,
      at: Date.now(),
    });
  }, [snapped?.nearestNodeId, snapped?.confidence, previewMode, processJourneyEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!layout) return;
    processJourneyEvent({ type: "tick", minutesToDeparture: minutesRounded, at: Date.now() });
  }, [minutesRounded, layout, processJourneyEvent]);

  /* ── Instruction progress → haptics + spoken turns + arrival ────────── */
  useEffect(() => {
    if (!activeRoute || !snapped) return;
    const along = metersAlongRoute(activeRoute, snapped.nearestNodeId);
    if (along === null) return;

    // Arrival: snapped onto the final route node
    if (snapped.nearestNodeId === activeRoute.nodeIds[activeRoute.nodeIds.length - 1]) {
      const targetPoi = layout?.pois.find((poi) => poi.id === activeRoute.toPoiId);
      haptic();
      sayAndShow(`You've arrived — ${activeDestName ?? "destination"}.`);
      if (targetPoi) {
        processJourneyEvent({ type: "arrived_at_route_end", poiCategory: targetPoi.category, at: Date.now() });
      }
      endRoute();
      return;
    }

    // Current instruction = last one whose trigger point we've passed
    let idx = 0;
    for (let i = 0; i < activeRoute.instructions.length; i++) {
      if (activeRoute.instructions[i].atMeters <= along + 1) idx = i;
    }
    if (idx > lastInstructionIdxRef.current) {
      lastInstructionIdxRef.current = idx;
      setCurrentStepIdx(idx);
      const instruction = activeRoute.instructions[idx];
      if (instruction && instruction.maneuver !== "arrive") {
        haptic();
        sayAndShow(instruction.text);
      }
    }
  }, [snapped?.nearestNodeId, activeRoute, layout, activeDestName, haptic, sayAndShow, processJourneyEvent, endRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Gate route + Boarding Pressure Index (spec §L.1) ───────────────── */
  const gateRoute = useMemo(() => {
    if (!gatePoi || !layout || !originNodeId) return null;
    return computeRoute({
      layout,
      fromNodeId: originNodeId,
      toPoiId: gatePoi.id,
      credentials,
      calibration: navCalibration ?? undefined,
      profile: sprint ? "sprint" : "default",
    });
  }, [gatePoi, layout, originNodeId, credentials, navCalibration, sprint]);

  const pressure: BoardingPressure | null = useMemo(() => {
    if (!gateRoute || minutesRounded > 600) return null;
    // gateRoute.totalSeconds already includes the security-lane wait when the
    // route crosses a checkpoint, so securityWaitSeconds stays 0 here.
    return computeBoardingPressure({
      minutesToDeparture: minutesRounded,
      walkToGateSeconds: gateRoute.totalSeconds,
      securityWaitSeconds: 0,
      throughSecurity: true,
    });
  }, [gateRoute, minutesRounded]);

  // Sprint self-suggestion — once, calmly (spec: calm urgency, never panic)
  useEffect(() => {
    if (!pressure || sprintRef.current || sprintSuggestedRef.current) return;
    if (pressure.verdict === "sprint" || pressure.verdict === "at_risk") {
      sprintSuggestedRef.current = true;
      sayAndShow("Running tight — say 'fastest route' or tap the timer chip and I'll get you there quickest.");
    }
  }, [pressure, sayAndShow]);

  const onPressureChipTap = useCallback(() => {
    if (!pressure) return;
    if ((pressure.verdict === "sprint" || pressure.verdict === "at_risk") && gatePoi) {
      setSprintMode(true);
      startRoute(gatePoi.id, true);
      return;
    }
    showSubtitle(pressure.breakdown);
  }, [pressure, gatePoi, setSprintMode, startRoute, showSubtitle]);

  // Auto-start gate walk once when layout + gate are ready (after PreCheck answer if needed).
  const autoGateStartedRef = useRef(false);
  useEffect(() => {
    if (autoGateStartedRef.current) return;
    if (!layout || !gatePoi || activeRoute || quietMode) return;
    if (!credentials.known) return;
    autoGateStartedRef.current = true;
    startRoute(gatePoi.id, true);
  }, [layout, gatePoi, activeRoute, quietMode, credentials.known, startRoute]);


  /* ── Voice co-pilot ─────────────────────────────────────────────────── */
  const bestLoungePoi = useCallback((): PoiDefinition | null => {
    if (!layout || !originNodeId) return null;
    const loungePois = layout.pois.filter((poi) => poi.category === "lounge");
    if (loungePois.length === 0) return null;
    const scored = loungePois
      .map((poi) => {
        const route = computeRoute({
          layout,
          fromNodeId: originNodeId,
          toPoiId: poi.id,
          credentials,
          calibration: navCalibration ?? undefined,
        });
        return route
          ? { poi, seconds: route.totalSeconds, eligible: loungeIsEligible(poi.name, eligibleLoungeNames) }
          : null;
      })
      .filter((entry): entry is { poi: PoiDefinition; seconds: number; eligible: boolean } => entry !== null)
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.seconds - b.seconds);
    return scored[0]?.poi ?? null;
  }, [layout, originNodeId, credentials, navCalibration, eligibleLoungeNames]);

  const securityPoi = useCallback((): PoiDefinition | null => {
    if (!layout) return null;
    const securityPois = layout.pois.filter((poi) => poi.category === "security");
    if (securityPois.length === 0) return null;
    if (credentials.clear) {
      const withClear = securityPois.find((poi) => poi.lanes?.includes("clear"));
      if (withClear) return withClear;
    }
    if (credentials.tsaPreCheck) {
      const withPre = securityPois.find((poi) => poi.lanes?.includes("precheck"));
      if (withPre) return withPre;
    }
    return securityPois[0];
  }, [layout, credentials]);

  const executeConciergeAction = useCallback(
    (action: string) => {
      switch (action) {
        case "navigate_gate":
          if (gatePoi) startRoute(gatePoi.id, true);
          return;
        case "navigate_lounge": {
          const lounge = bestLoungePoi();
          if (lounge) startRoute(lounge.id, true);
          return;
        }
        case "navigate_security": {
          const checkpoint = securityPoi();
          if (checkpoint) startRoute(checkpoint.id, true);
          return;
        }
        case "navigate_checkin": {
          const checkin = layout?.pois.find((poi) => poi.category === "checkin");
          if (checkin) startRoute(checkin.id, true);
          return;
        }
        case "navigate_restroom": {
          const restroom = layout?.pois.find((poi) => poi.category === "restroom");
          if (restroom) startRoute(restroom.id, true);
          return;
        }
        case "sprint":
          setSprintMode(true);
          if (gatePoi) startRoute(gatePoi.id, true);
          return;
        default:
          return;
      }
    },
    [gatePoi, layout, startRoute, bestLoungePoi, securityPoi, setSprintMode],
  );

  const askConcierge = useCallback(
    (utterance: string) => {
      showSubtitle("Hmm, let me think…");
      const payload = {
        utterance,
        iata,
        journeyPhase: journeyRef.current.phase,
        throughSecurity: journeyRef.current.throughSecurity,
        gateCode,
        minutesToDeparture: minutesRounded,
        pressureLine: pressure?.line ?? "",
        pressureBreakdown: pressure?.breakdown ?? "",
        pressureVerdict: pressure?.verdict ?? "unknown",
        walkToGateMinutes: gateRoute ? Math.round(gateRoute.totalSeconds / 60) : null,
        credentials,
        eligibleLounges: eligibleLoungeNames.slice(0, 10),
      };
      void fetch("/api/airport-nav/voice-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((concierge: { spoken?: string; action?: string }) => {
          if (concierge.spoken) sayAndShow(concierge.spoken);
          if (concierge.action && concierge.action !== "none") executeConciergeAction(concierge.action);
        })
        .catch(() => {
          sayAndShow("I can take you to your gate, a lounge, security, check-in, or a restroom.");
        });
    },
    [iata, gateCode, minutesRounded, pressure, gateRoute, credentials, eligibleLoungeNames, sayAndShow, showSubtitle, executeConciergeAction],
  );

  const handleUtterance = useCallback(
    (transcript: string) => {
      const intent = routeVoiceIntent(transcript);
      switch (intent.intent) {
        case "navigate_gate": {
          if (gatePoi) startRoute(gatePoi.id, true);
          else sayAndShow("I don't have your gate yet — I'll route you as soon as it's assigned.");
          return;
        }
        case "navigate_lounge": {
          const lounge = bestLoungePoi();
          if (!lounge) {
            sayAndShow("I don't have lounge locations for this airport yet.");
            return;
          }
          const eligible = loungeIsEligible(lounge.name, eligibleLoungeNames);
          startRoute(lounge.id, true);
          if (eligible) showSubtitle(`${lounge.name} — you have access ✓`);
          return;
        }
        case "navigate_security": {
          const checkpoint = securityPoi();
          if (checkpoint) startRoute(checkpoint.id, true);
          return;
        }
        case "navigate_checkin": {
          const checkin = layout?.pois.find((poi) => poi.category === "checkin" && !poi.airline)
            ?? layout?.pois.find((poi) => poi.category === "checkin");
          if (checkin) startRoute(checkin.id, true);
          return;
        }
        case "navigate_restroom": {
          const restroom = layout?.pois.find((poi) => poi.category === "restroom");
          if (restroom) startRoute(restroom.id, true);
          else sayAndShow("I don't have restroom locations mapped here yet.");
          return;
        }
        case "navigate_train": {
          const prefix = gateCode?.trim().toUpperCase()[0];
          const trains = layout?.pois.filter((poi) => poi.category === "train") ?? [];
          const train = (prefix === "S" ? trains.find((poi) => poi.id.includes("-s")) : trains.find((poi) => poi.id.includes("-n"))) ?? trains[0];
          if (train) startRoute(train.id, true);
          return;
        }
        case "set_credentials": {
          if (!intent.credentials) return;
          answerCredentials(intent.credentials.tsaPreCheck, intent.credentials.clear);
          const lane = intent.credentials.clear ? "CLEAR" : intent.credentials.tsaPreCheck ? "TSA PreCheck" : "standard";
          sayAndShow(`Got it — I'll route you through the ${lane} lane.`);
          return;
        }
        case "next_step": {
          const next = activeRoute?.instructions[Math.max(0, lastInstructionIdxRef.current)]?.text;
          sayAndShow(next ?? statusLine ?? phaseStatusLine(journeyRef.current.phase, gateCode));
          return;
        }
        case "eta": {
          if (activeRoute) {
            sayAndShow(`About ${fmtMins(activeRoute.totalSeconds)} to ${activeDestName ?? "your destination"}.`);
            return;
          }
          if (gatePoi && layout && originNodeId) {
            const route = computeRoute({
              layout,
              fromNodeId: originNodeId,
              toPoiId: gatePoi.id,
              credentials,
              calibration: navCalibration ?? undefined,
            });
            if (route) {
              sayAndShow(`About ${fmtMins(route.totalSeconds)} to ${gateCode ? `Gate ${gateCode.toUpperCase()}` : "your gate"}.`);
              return;
            }
          }
          sayAndShow("Start a route and I'll keep you posted on timing.");
          return;
        }
        case "sprint": {
          setSprintMode(true);
          if (gatePoi) startRoute(gatePoi.id, true);
          else sayAndShow("Fastest pace it is — I'll route you the moment your gate is assigned.");
          return;
        }
        case "cancel": {
          setSprintMode(false);
          endRoute();
          sayAndShow("Navigation ended.");
          return;
        }
        default:
          // Open-ended question → Claude concierge fall-through with full
          // journey context (spec §D5). Offline or error → honest fallback.
          askConcierge(transcript);
      }
    },
    [gatePoi, gateCode, layout, originNodeId, credentials, activeRoute, activeDestName, statusLine, eligibleLoungeNames, startRoute, endRoute, answerCredentials, bestLoungePoi, securityPoi, sayAndShow, showSubtitle, setSprintMode, askConcierge],
  );

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      showSubtitle("Voice isn't supported in this browser.");
      return;
    }
    // First mic use unlocks TTS (user gesture requirement + sensible default)
    voiceOnRef.current = true;
    setVoiceOn(true);
    try {
      const recognition = new SpeechRecognitionImpl();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript as string | undefined;
        if (transcript) {
          showSubtitle(`"${transcript}"`);
          handleUtterance(transcript);
        }
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [handleUtterance, showSubtitle]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const toggleVoice = useCallback(() => {
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    if (!next) {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
    }
  }, []);

  /* ── Leave-by chip (lounge phase) ───────────────────────────────────── */
  const leaveByLabel = useMemo(() => {
    if (journeyPhase !== "lounge" || !gateRoute) return null;
    const leaveByMs = Date.now() + minutesRounded * 60_000 - gateRoute.totalSeconds * 1000 - 15 * 60_000;
    if (leaveByMs <= Date.now()) return "Leave now";
    return `Leave by ${fmtClock(leaveByMs)}`;
  }, [journeyPhase, gateRoute, minutesRounded]);

  /* ── Map init (dark schematic canvas, no remote style) ──────────────── */
  useEffect(() => {
    // Planning mode is intentionally SVG-only: it must work without WebGL,
    // MapTiler, or a SECOND live map competing with the family map's WebGL
    // context + shared worker. Running the 3D map in planning made Plan-airport
    // flash then blank (regression 2026-07-13) — keep preview on the schematic.
    if (previewMode || !mapEl.current || mapRef.current || !layout) return;
    let disposed = false;
    let layersInstalled = false;
    let unbindResize: (() => void) | null = null;
    let loadRetryTimer: number | null = null;
    let mapCanvas: HTMLCanvasElement | null = null;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) setMapReady(false);
    };

    const finalizeMap = (map: import("maplibre-gl").Map) => {
      if (disposed || layersInstalled) return;
      try {
        installAirportLayoutLayers(map, layout);
        if (!map.getSource("kepi-zones")) return;
        layersInstalled = true;
        if (loadRetryTimer !== null) {
          window.clearInterval(loadRetryTimer);
          loadRetryTimer = null;
        }
        setMapReady(true);
        // Frame the actual terminal footprint. Real OSM-derived layouts are
        // irregular and off-centre, so a fixed center+zoom crops them (M17).
        const bounds = computeLayoutBounds(layout);
        window.requestAnimationFrame(() => {
          try {
            map.resize();
            if (bounds) {
              map.fitBounds(bounds, {
                padding: { top: 90, bottom: 150, left: 40, right: 40 },
                pitch: 58,
                bearing: -15,
                maxZoom: 16.2,
                duration: 0,
              });
            }
          } catch {
            /* ignore */
          }
        });
      } catch (error) {
        console.error("[AirportNavigatorMap] Layer install failed", error);
        if (!disposed) setLayoutStatus("error");
      }
    };

    void import("maplibre-gl")
      .then((ml) => {
        if (disposed || !mapEl.current || mapRef.current) return;
        try {
          const map = new ml.Map({
            container: mapEl.current,
            style: {
              version: 8,
              sources: {},
              layers: [{ id: "bg", type: "background", paint: { "background-color": COLOR.canvas } }],
            },
            center: layout.center,
            zoom: 15.2,
            pitch: 58,
            bearing: -15,
            pixelRatio: getMapPixelRatio(),
            attributionControl: false,
            dragRotate: true,
            fadeDuration: 0,
          });
          mapRef.current = map;
          unbindResize = bindMapResize(mapEl.current, map);
          mapCanvas = map.getCanvas();
          mapCanvas.addEventListener("webglcontextlost", handleContextLost);

          map.on("load", () => finalizeMap(map));
          map.on("styledata", () => finalizeMap(map));
          if (map.isStyleLoaded()) finalizeMap(map);

          loadRetryTimer = window.setInterval(() => {
            if (!disposed && !layersInstalled) finalizeMap(map);
          }, 100);

          map.on("remove", () => {
            if (loadRetryTimer !== null) window.clearInterval(loadRetryTimer);
            mapCanvas?.removeEventListener("webglcontextlost", handleContextLost);
            unbindResize?.();
          });
        } catch (error) {
          console.error("[AirportNavigatorMap] Map init failed", error);
          if (!disposed) setLayoutStatus("error");
        }
      })
      .catch((error) => {
        console.error("[AirportNavigatorMap] MapLibre load failed", error);
        if (!disposed) setLayoutStatus("error");
      });
    return () => {
      disposed = true;
      if (loadRetryTimer !== null) window.clearInterval(loadRetryTimer);
      mapCanvas?.removeEventListener("webglcontextlost", handleContextLost);
      unbindResize?.();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      poiMarkersRef.current = {};
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, [layout, previewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    window.requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });
  }, [fill, expanded, mapReady]);

  /* ── Route geometry + warmth gradient ───────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("kepi-route");
    if (!source) return;
    if (!activeRoute) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: activeRoute.coordinates },
    });

    let progress = 0;
    if (snapped) {
      const idx = activeRoute.nodeIds.indexOf(snapped.nearestNodeId);
      if (idx > 0) progress = idx / Math.max(1, activeRoute.nodeIds.length - 1);
    }
    const fadeStart = Math.min(0.96, Math.max(0.001, progress));
    const fadeEnd = Math.min(0.98, fadeStart + 0.02);
    map.setPaintProperty("kepi-route-line", "line-gradient", [
      "interpolate", ["linear"], ["line-progress"],
      0, PATH_DIM,
      fadeStart, PATH_DIM,
      fadeEnd, PATH_WARM,
      1, PATH_WARM_BRIGHT,
    ]);

    if (activeRoute.coordinates.length > 1) {
      const lngs = activeRoute.coordinates.map((coord) => coord[0]);
      const lats = activeRoute.coordinates.map((coord) => coord[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 70, pitch: 58, duration: 800 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, mapReady, snapped?.nearestNodeId]);

  /* ── POI bubble markers ─────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !layout) return;
    void import("maplibre-gl").then((ml) => {
      for (const key of Object.keys(poiMarkersRef.current)) {
        poiMarkersRef.current[key].remove();
      }
      poiMarkersRef.current = {};

      const nodePos = new Map(layout.nodes.map((node) => [node.id, node.pos]));
      const selectedId = selectedPoiId ?? activeRoute?.toPoiId ?? null;
      for (const poi of layout.pois) {
        if (poi.category === "checkin" && poi.airline && airlineName && !airlineName.toLowerCase().includes(poi.airline.toLowerCase())) {
          continue;
        }
        if (poi.category === "checkin" && poi.airline && !airlineName) continue;
        const pos = nodePos.get(poi.nodeId);
        if (!pos) continue;

        const isSelected = selectedId !== null && poi.id === selectedId;
        const isGateBubble = gatePoi !== null && poi.id === gatePoi.id;
        const urgent = isGateBubble && minutesRounded <= 45;
        const critical = isGateBubble && minutesRounded <= 20;
        const isObjective =
          (objective === "gate" && isGateBubble) ||
          (objective === "security" && poi.category === "security") ||
          (objective === "checkin" && poi.category === "checkin") ||
          (objective === "lounge" && poi.category === "lounge");
        const eligibleLounge = poi.category === "lounge" && loungeIsEligible(poi.name, eligibleLoungeNames);

        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.setAttribute("aria-label", `Navigate to ${poi.name}`);
        bubble.style.cssText = [
          "display:flex;align-items:center;gap:5px;",
          "padding:5px 10px;border-radius:9999px;cursor:pointer;",
          "font:600 11px system-ui,-apple-system,sans-serif;white-space:nowrap;",
          "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);",
          critical
            ? "background:rgba(220,38,38,0.92);color:#fff;border:1px solid #fca5a5;"
            : urgent
            ? "background:rgba(245,158,11,0.92);color:#1f2937;border:1px solid #fde68a;"
            : isGateBubble
            ? "background:rgba(255,255,255,0.95);color:#0b1f3a;border:2px solid #f4c95d;"
            : eligibleLounge
            ? "background:rgba(236,253,245,0.95);color:#065f46;border:1.5px solid #34d399;"
            : "background:rgba(255,255,255,0.82);color:#1e293b;border:1px solid rgba(255,255,255,0.5);",
          isObjective && !isGateBubble ? "outline:2px solid #f4c95d;outline-offset:1px;" : "",
          isSelected ? "outline:3px solid #38bdf8;outline-offset:2px;transform:scale(1.1);z-index:5;" : "",
          "box-shadow:0 4px 14px rgba(0,0,0,0.35);",
          critical || urgent ? "animation:kepiPulse 1.6s ease-in-out infinite;" : "",
        ].join("");
        const gateLabel = isGateBubble && gateCode ? `Gate ${gateCode.toUpperCase()}` : poi.name;
        const countdown = isGateBubble && minutesRounded > 0 && minutesRounded < 600 ? ` · ${minutesRounded}m` : "";
        const accessMark = eligibleLounge ? " ✓" : "";
        const laneSummary = poi.category === "security"
          ? poi.lanes
              ?.filter((lane) => lane !== "standard")
              .map((lane) => lane === "precheck" ? "PreCheck" : lane === "clear" ? "CLEAR" : lane)
              .join(" · ")
          : "";
        bubble.textContent = `${POI_ICON[poi.category]} ${gateLabel}${countdown}${accessMark}${laneSummary ? ` · ${laneSummary}` : ""}`;
        bubble.addEventListener("click", () => handlePoiTap(poi.id));

        const marker = new ml.Marker({ element: bubble, anchor: "bottom", offset: [0, -6] })
          .setLngLat(pos as [number, number])
          .addTo(map);
        poiMarkersRef.current[poi.id] = marker;
      }
    });
    return () => {
      for (const key of Object.keys(poiMarkersRef.current)) {
        poiMarkersRef.current[key].remove();
      }
      poiMarkersRef.current = {};
    };
  }, [mapReady, layout, gatePoi, gateCode, minutesRounded, airlineName, objective, eligibleLoungeNames, startRoute, selectedPoiId, activeRoute]);

  /* ── Snapped user puck with confidence halo ─────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!snapped) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }
    void import("maplibre-gl").then((ml) => {
      const haloPx = Math.round(Math.min(110, Math.max(34, (userAccuracyM ?? 35) * 1.2)));
      if (!userMarkerRef.current) {
        const wrap = document.createElement("div");
        wrap.dataset.testid = "airport-nav-live-user";
        wrap.setAttribute("aria-label", `Your approximate location${userAccuracyM ? `, within about ${Math.round(userAccuracyM)} meters` : ""}`);
        wrap.style.cssText = "position:relative;display:flex;align-items:center;justify-content:center;";
        const halo = document.createElement("div");
        halo.dataset.role = "halo";
        const dot = document.createElement("div");
        dot.style.cssText =
          "width:20px;height:20px;border-radius:50%;background:#38bdf8;border:3px solid #fff;box-shadow:0 0 12px rgba(56,189,248,0.9);position:relative;z-index:1;";
        wrap.appendChild(halo);
        wrap.appendChild(dot);
        userMarkerRef.current = new ml.Marker({ element: wrap, anchor: "center" })
          .setLngLat(snapped.pos as [number, number])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat(snapped.pos as [number, number]);
      }
      const haloEl = userMarkerRef.current.getElement().querySelector('[data-role="halo"]') as HTMLDivElement | null;
      if (haloEl) {
        haloEl.style.cssText = `position:absolute;width:${haloPx}px;height:${haloPx}px;border-radius:50%;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.35);`;
      }
    });
  }, [mapReady, snapped, userAccuracyM]);

  /* ── Family pins snapped to terminal graph (honest GPS — may be approximate) ─ */
  const familySnapped = useMemo(() => {
    if (!layout || familyPins.length === 0) return [];
    return familyPins.flatMap((pin) => {
      const snappedPin = snapToGraph(layout, pin.lon, pin.lat);
      if (!snappedPin) return [];
      return [{ pin, snapped: snappedPin }];
    });
  }, [layout, familyPins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    void import("maplibre-gl").then((ml) => {
      const activeIds = new Set(familySnapped.map(({ pin }) => pin.memberId));

      for (const [memberId, marker] of Object.entries(familyMarkersRef.current)) {
        if (!activeIds.has(memberId)) {
          marker.remove();
          delete familyMarkersRef.current[memberId];
        }
      }

      for (const { pin, snapped: snappedPin } of familySnapped) {
        const pos = snappedPin.pos as [number, number];
        let marker = familyMarkersRef.current[pin.memberId];

        if (!marker) {
          const wrap = document.createElement("div");
          wrap.dataset.testid = `airport-family-marker-${pin.memberId}`;
          wrap.style.cssText =
            "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:auto;";

          const dotWrap = document.createElement("div");
          dotWrap.style.cssText = "position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;";
          const halo = document.createElement("div");
          halo.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${pin.color}33;border:1px solid ${pin.color}66;`;
          const av = document.createElement("div");
          av.style.cssText = [
            `width:28px;height:28px;border-radius:50%;background:${pin.color};`,
            "border:2px solid #fff;color:#fff;font:800 12px system-ui,sans-serif;",
            "display:flex;align-items:center;justify-content:center;position:relative;z-index:1;",
            pin.stale ? "opacity:0.55;" : "",
            "box-shadow:0 2px 8px rgba(0,0,0,0.35);",
          ].join("");
          av.textContent = pin.name.charAt(0).toUpperCase();
          dotWrap.appendChild(halo);
          dotWrap.appendChild(av);

          const lbl = document.createElement("div");
          lbl.style.cssText = [
            "background:rgba(10,16,28,0.88);border:1px solid rgba(255,255,255,0.15);",
            "border-radius:9999px;padding:3px 8px;font:700 10px system-ui,sans-serif;color:#f8fafc;",
            "white-space:nowrap;max-width:96px;overflow:hidden;text-overflow:ellipsis;",
          ].join("");
          lbl.textContent = pin.name;

          wrap.appendChild(dotWrap);
          wrap.appendChild(lbl);
          wrap.addEventListener("click", () => onFamilyPinTap?.(pin.memberId));

          marker = new ml.Marker({ element: wrap, anchor: "bottom", offset: [0, -4] })
            .setLngLat(pos)
            .addTo(map);
          familyMarkersRef.current[pin.memberId] = marker;
        } else {
          marker.setLngLat(pos);
        }
      }
    });

    return () => {
      for (const marker of Object.values(familyMarkersRef.current)) marker.remove();
      familyMarkersRef.current = {};
    };
  }, [mapReady, familySnapped, onFamilyPinTap]);

  /* ── Animated dash flow on the active path (subtle forward shimmer) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !activeRoute) return;
    const dashPhases: [number, number, number][] = [
      [0, 2.2, 2.2],
      [1.1, 2.2, 1.1],
      [2.2, 2.2, 0.001],
    ];
    let phase = 0;
    const interval = setInterval(() => {
      phase = (phase + 1) % dashPhases.length;
      try {
        map.setPaintProperty("kepi-route-line", "line-dasharray", dashPhases[phase]);
      } catch {
        /* layer mid-teardown */
      }
    }, 220);
    return () => {
      clearInterval(interval);
      try {
        map.setPaintProperty("kepi-route-line", "line-dasharray", [1, 0]);
      } catch {
        /* noop */
      }
    };
  }, [mapReady, activeRoute]);

  /* ── Zone ground labels + destination beacon (DOM markers) ──────────── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoneMarkersRef = useRef<any[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !layout) return;
    void import("maplibre-gl").then((ml) => {
      for (const marker of zoneMarkersRef.current) marker.remove();
      zoneMarkersRef.current = [];
      for (const zone of layout.zones) {
        const ring = zone.ring;
        const cLng = ring.reduce((sum, pt) => sum + pt[0], 0) / ring.length;
        const cLat = ring.reduce((sum, pt) => sum + pt[1], 0) / ring.length;
        const label = document.createElement("div");
        label.textContent = zone.name.toUpperCase();
        label.style.cssText =
          "pointer-events:none;font:700 8px system-ui,-apple-system,sans-serif;letter-spacing:0.14em;color:rgba(255,255,255,0.38);text-shadow:0 1px 4px rgba(0,0,0,0.6);white-space:nowrap;";
        zoneMarkersRef.current.push(
          new ml.Marker({ element: label, anchor: "center" }).setLngLat([cLng, cLat]).addTo(map),
        );
      }
    });
    return () => {
      for (const marker of zoneMarkersRef.current) marker.remove();
      zoneMarkersRef.current = [];
    };
  }, [mapReady, layout]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beaconMarkerRef = useRef<any>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (beaconMarkerRef.current) {
      beaconMarkerRef.current.remove();
      beaconMarkerRef.current = null;
    }
    if (!activeRoute || activeRoute.coordinates.length === 0) return;
    void import("maplibre-gl").then((ml) => {
      const dest = activeRoute.coordinates[activeRoute.coordinates.length - 1];
      const ring = document.createElement("div");
      ring.style.cssText =
        "pointer-events:none;width:22px;height:22px;border-radius:50%;border:2px solid #f4c95d;animation:kepiBeacon 1.8s ease-out infinite;";
      beaconMarkerRef.current = new ml.Marker({ element: ring, anchor: "center" })
        .setLngLat(dest as [number, number])
        .addTo(map);
    });
    return () => {
      if (beaconMarkerRef.current) {
        beaconMarkerRef.current.remove();
        beaconMarkerRef.current = null;
      }
    };
  }, [mapReady, activeRoute]);

  // Compass-heading direction arrow — only live (not preview) with a route + position.
  // Declared before any early return so hook order stays stable.
  const { heading: deviceHeading, needsPermission: headingNeedsPermission, requestPermission: requestHeading } =
    useDeviceHeading(!previewMode && Boolean(activeRoute));
  const directionArrow = useMemo(() => {
    if (previewMode || !activeRoute || !snapped) return null;
    const userPos: [number, number] =
      userLon !== null && userLat !== null ? [userLon, userLat] : snapped.pos;
    const stepIdx = Math.min(currentStepIdx, Math.max(0, activeRoute.instructions.length - 1));
    const landmark = activeRoute.instructions[stepIdx]?.landmark ?? activeDestName;
    return computeDirectionArrow({
      userPos,
      route: activeRoute,
      currentNodeId: snapped.nearestNodeId,
      headingDeg: deviceHeading,
      targetLandmark: landmark,
    });
  }, [previewMode, activeRoute, snapped, userLon, userLat, deviceHeading, currentStepIdx, activeDestName]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (layoutStatus === "unsupported" || layoutStatus === "error") {
    return (
      <AirportNavigatorFallback
        iata={iata}
        gateCode={gateCode}
        airlineName={airlineName}
        flightNumber={flightNumber}
        arrivalAirport={arrivalAirport}
        departureTerminal={departureTerminal}
        departureClockLabel={departureClockLabel}
        flightStatusLabel={flightStatusLabel}
        flightDelayed={flightDelayed}
        minutesToDeparture={minutesToDeparture}
        proximityStatus={proximityStatus}
        userLat={userLat}
        userLon={userLon}
        credentials={credentials}
        eligibleLoungeNames={eligibleLoungeNames}
        fill={fill}
        onSwitchToFamilyView={onSwitchToFamilyView}
        layoutLoadFailed={layoutStatus === "error"}
        familyPins={familyPins}
        onFamilyPinTap={onFamilyPinTap}
      />
    );
  }

  const nextInstruction = activeRoute?.instructions[Math.min(currentStepIdx, Math.max(0, (activeRoute?.instructions.length ?? 1) - 1))] ?? null;
  const securityQuestionOpen = pendingPoiId !== null && !credentials.known;

  return (
    <div
      data-testid="airport-nav-indoor-map"
      data-map-ready={mapReady ? "true" : "false"}
      className={
        fill
          ? "relative h-full w-full overflow-hidden bg-[#0b1f3a]"
          : expanded
          ? "fixed inset-0 z-[100] overflow-hidden bg-[#0b1f3a]"
          : "relative overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1f3a]"
      }
      style={fill || expanded ? undefined : { height: 420 }}
    >
      <style>{`@keyframes kepiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes kepiMicRing{0%{box-shadow:0 0 0 0 rgba(56,189,248,0.55)}100%{box-shadow:0 0 0 14px rgba(56,189,248,0)}}
@keyframes kepiBeacon{0%{transform:scale(0.6);opacity:0.9}100%{transform:scale(1.9);opacity:0}}`}</style>
      <div
        ref={mapEl}
        className={`absolute inset-0 transition-opacity ${previewMode || !mapReady ? "pointer-events-none opacity-0" : "opacity-100"}`}
      />
      {layout && (previewMode || !mapReady) ? (
        <AirportSchematicLayer
          layout={layout}
          activeRoute={activeRoute}
          selectedPoiId={selectedPoiId ?? pendingPoiId ?? activeRoute?.toPoiId ?? null}
          snapped={previewMode ? null : snapped}
          userAccuracyM={userAccuracyM}
          familyPins={familyPins}
          airlineName={airlineName}
          gatePoiId={gatePoi?.id ?? null}
          gateCode={gateCode}
          minutesToDeparture={minutesRounded}
          onPoiClick={handlePoiTap}
        />
      ) : null}
      {/* Vignette + top legibility gradient — concierge depth, not flat canvas */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(2,8,20,0.55) 100%), linear-gradient(to bottom, rgba(2,8,20,0.55), transparent 22%)",
        }}
      />
      {/* Expand / close — the map is always one tap away, and one tap out */}
      {!fill && (
      <button
        type="button"
        aria-label={expanded ? "Close full map" : "Open full map"}
        onClick={() => setExpanded((open) => !open)}
        className="absolute right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-sm font-bold text-white backdrop-blur"
        style={{ top: expanded ? "max(0.75rem, env(safe-area-inset-top))" : "0.75rem" }}
      >
        {expanded ? "✕" : "⤢"}
      </button>
      )}

      {/* Preview banner — plan lounges, check-in, and gate before travel day */}
      {previewMode ? (
        <div
          className="pointer-events-none absolute left-3 right-3 z-20 rounded-2xl border border-sky-400/30 bg-sky-950/80 px-3 py-2 backdrop-blur-md"
          style={{ top: fill ? "max(4.5rem, calc(env(safe-area-inset-top) + 4rem))" : "3.25rem" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Explore before you go</p>
          <p className="text-[11px] leading-snug text-sky-100/90">
            {gateCode
              ? `Tap Essentials, Lounges, or any label to explore ${iata}. Live directions start when you arrive.`
              : `Gate assignment pending. Explore check-in, security, trains, and lounges now — your gate will highlight when assigned.`}
          </p>
        </div>
      ) : null}

      {layout ? (
        <AirportDestinationRail
          layout={layout}
          airlineName={airlineName}
          gatePoiId={gatePoi?.id ?? null}
          gateCode={gateCode}
          selectedPoiId={selectedPoiId ?? pendingPoiId ?? activeRoute?.toPoiId ?? null}
          credentials={credentials}
          hasApproximatePosition={!previewMode && Boolean(snapped)}
          onPoiClick={handlePoiTap}
        />
      ) : null}

      {/* Flight hero card — everything glanceable: gate, flight, boarding, status */}
      <div
        className="pointer-events-none absolute left-3 right-14 z-10 flex items-start justify-between gap-2"
        style={{ top: expanded ? "max(0.75rem, env(safe-area-inset-top))" : "0.75rem" }}
      >
        <div className="pointer-events-auto min-w-0">
          <button
            type="button"
            onClick={() => setHeroOpen((open) => !open)}
            className="block w-full rounded-2xl bg-black/55 px-3 py-2 text-left backdrop-blur"
            aria-label="Toggle flight details"
          >
            {heroOpen ? (
              <span className="flex items-center gap-3">
                <span className="flex flex-col items-center rounded-xl bg-white/10 px-2.5 py-1">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-sky-200/90">Gate</span>
                  <span className="text-xl font-black leading-tight text-white">{gateCode?.toUpperCase() ?? "TBD"}</span>
                  {departureTerminal && (
                    <span className="text-[8px] font-semibold text-sky-200/70">Term {departureTerminal}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold text-white">
                    {[airlineName, flightNumber].filter(Boolean).join(" ") || "Your flight"}
                    {arrivalAirport ? ` · ${iata} → ${arrivalAirport.toUpperCase()}` : ""}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-sky-100/90">
                    {minutesRounded > 30 && minutesRounded < 600
                      ? `Boards in ${minutesRounded - 30} min`
                      : minutesRounded <= 30 && minutesRounded > 0
                      ? "Boarding now"
                      : departureClockLabel
                      ? `Departs ${departureClockLabel}`
                      : ""}
                    {departureClockLabel && minutesRounded < 600 ? ` · departs ${departureClockLabel}` : ""}
                    {flightStatusLabel ? (
                      <span className={flightDelayed ? " text-amber-300" : " text-emerald-300"}>
                        {" "}· {flightStatusLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[9px] text-sky-200/70">
                    {previewMode
                      ? "Planning mode — browse the terminal layout"
                      : `${statusLine ?? phaseStatusLine(journeyPhase, gateCode)}${snapped ? ` · position ${Math.round(snapped.confidence * 100)}%` : " · locating…"}`}
                  </span>
                </span>
              </span>
            ) : (
              <span className="block truncate text-[11px] font-bold text-white">
                {gateCode ? `Gate ${gateCode.toUpperCase()}` : "Gate TBD"}
                {minutesRounded > 30 && minutesRounded < 600 ? ` · boards in ${minutesRounded - 30}m` : ""}
                {" "}· {statusLine ?? phaseStatusLine(journeyPhase, gateCode)}
              </span>
            )}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          {pressure && !previewMode && (
            <button
              type="button"
              onClick={onPressureChipTap}
              className={`pointer-events-auto rounded-lg px-2 py-1 text-[10px] font-bold backdrop-blur ${
                pressure.verdict === "comfortable"
                  ? "bg-black/45 text-emerald-300"
                  : pressure.verdict === "tight"
                  ? "bg-black/45 text-amber-300"
                  : "bg-red-600/90 text-white"
              }`}
              aria-label="Boarding time budget"
            >
              {sprint ? "⚡ " : ""}{pressure.verdict === "at_risk" ? "⚠ " : ""}{pressure.line}
            </button>
          )}
          {leaveByLabel && !previewMode && (
            <span className={`rounded-lg px-2 py-1 text-[10px] font-bold backdrop-blur ${leaveByLabel === "Leave now" ? "bg-amber-500/90 text-slate-900" : "bg-black/45 text-amber-200"}`}>
              ⏱ {leaveByLabel}
            </span>
          )}
          <button
            type="button"
            onClick={toggleVoice}
            className="pointer-events-auto rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-white backdrop-blur"
            aria-label={voiceOn ? "Mute voice guidance" : "Unmute voice guidance"}
          >
            {voiceOn ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {!layout && layoutStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-semibold text-sky-200/80">Loading terminal map…</p>
        </div>
      )}

      {/* Voice subtitle */}
      {subtitle && (
        <div className="pointer-events-none absolute inset-x-10 bottom-20 flex justify-center">
          <p className="max-w-full truncate rounded-xl bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            {subtitle}
          </p>
        </div>
      )}

      {/* Mic — press and hold, thumb zone (live mode only) */}
      {layout && !previewMode && (
        <button
          type="button"
          aria-label="Hold to talk to Kepi"
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          style={{
            bottom: bottomMic,
            background: listening ? "#38bdf8" : "rgba(255,255,255,0.92)",
            animation: listening ? "kepiMicRing 1.2s ease-out infinite" : undefined,
          }} className="absolute right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-xl"
        >
          🎙
        </button>
      )}

      {/* Journey prompt (e.g. "Are you through security yet?") */}
      {journeyPrompt && !securityQuestionOpen && !previewMode && (
        <div style={{ bottom: bottomPanel }} className="absolute inset-x-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{journeyPrompt.text}</p>
          <div className="mt-2 flex gap-1.5">
            {journeyPrompt.options.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => processJourneyEvent(option.event)}
                className="flex-1 rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Security credential question */}
      {securityQuestionOpen && (
        <div style={{ bottom: bottomPanel }} className="absolute inset-x-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Quick one — do you have TSA PreCheck or CLEAR?
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Kepi routes you to the correct security lane. Asked once — or just say it.</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => answerCredentials(true, false)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">PreCheck</button>
            <button type="button" onClick={() => answerCredentials(false, true)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">CLEAR</button>
            <button type="button" onClick={() => answerCredentials(true, true)} className="rounded-lg bg-sky-600 py-1.5 text-[10px] font-bold text-white">Both</button>
            <button type="button" onClick={() => answerCredentials(false, false)} className="rounded-lg bg-slate-200 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">Neither</button>
          </div>
        </div>
      )}

      {/* Quiet Mode at security — no nagging while hands are full */}
      {quietMode && !journeyPrompt && !securityQuestionOpen && (
        <div style={{ bottom: bottomPanel }} className="absolute inset-x-3 rounded-2xl bg-black/55 p-3 text-center backdrop-blur">
          <p className="text-[11px] font-semibold text-sky-100">
            We&apos;ll pick up on the other side.
            {gateCode ? ` Gate ${gateCode.toUpperCase()} after security.` : ""}
          </p>
        </div>
      )}

      {/* Compass direction arrow — points the way you're actually facing */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && directionArrow && (
        <div
          data-testid="airport-nav-direction-arrow"
          data-heading-known={directionArrow.headingKnown ? "true" : "false"}
          className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center"
          style={{ bottom: `calc(${bottomPanel} + 9.5rem)` }}
        >
          <div className="pointer-events-auto flex flex-col items-center rounded-3xl bg-black/60 px-4 py-3 backdrop-blur-md">
            <svg width="56" height="56" viewBox="0 0 56 56" aria-label={directionArrow.cue}>
              <circle cx="28" cy="28" r="26" fill="rgba(56,189,248,0.12)" stroke="rgba(125,211,252,0.5)" strokeWidth="1.5" />
              <g
                transform={`rotate(${directionArrow.rotationDeg} 28 28)`}
                style={{ transition: "transform 220ms ease-out" }}
              >
                <path d="M28 9 L39 40 L28 33 L17 40 Z" fill="#f4c95d" stroke="#fff3bd" strokeWidth="1" strokeLinejoin="round" />
              </g>
            </svg>
            <p className="mt-1 text-[13px] font-black leading-none text-white">{directionArrow.cue}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-sky-200/90">
              {directionArrow.distanceM} m
              {directionArrow.headingKnown ? "" : " · compass off"}
            </p>
            {!directionArrow.headingKnown && headingNeedsPermission ? (
              <button
                type="button"
                onClick={requestHeading}
                className="mt-1.5 rounded-full bg-sky-600 px-3 py-1 text-[10px] font-bold text-white"
              >
                Enable compass
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Tap-to-confirm "I'm here" — lock position when GPS is unsure indoors */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && !previewMode && layout && (
        <div
          className="pointer-events-auto absolute right-3 z-30"
          style={{ bottom: `calc(${bottomPanel} + ${activeRoute ? "9.5rem" : "3rem"})` }}
        >
          <button
            type="button"
            data-testid="airport-nav-confirm-location"
            aria-pressed={confirmMode}
            onClick={() => setConfirmMode((on) => !on)}
            className={`rounded-full px-3 py-2 text-[11px] font-bold shadow-lg backdrop-blur ${
              confirmMode ? "bg-[#f4c95d] text-[#0b1f3a]" : "bg-black/55 text-white"
            }`}
          >
            {confirmMode ? "Tap where you are" : confirmedNodeId ? "📍 Update my spot" : "📍 I'm here"}
          </button>
        </div>
      )}

      {/* Active route card */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && activeRoute && (
        <section
          aria-label="Route instructions"
          style={{ bottom: bottomPanel }}
          className={`absolute inset-x-2 z-30 overflow-hidden rounded-[24px] bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:bg-slate-900/95 sm:inset-x-3 ${
            showInstructions ? "max-h-[60dvh]" : "max-h-32"
          }`}
        >
          <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {previewMode ? "Route preview" : "Walking directions"}
              </p>
              <p className="mt-0.5 text-[18px] font-black leading-tight text-slate-900 dark:text-slate-100">
                {activeDestName} · {fmtMins(activeRoute.totalSeconds)}
                {activeRoute.laneUsed ? ` · ${activeRoute.laneUsed === "precheck" ? "PreCheck" : activeRoute.laneUsed === "clear" ? "CLEAR" : "standard"} lane` : ""}
              </p>
              {nextInstruction && (
                <p className="mt-1 text-[15px] leading-snug text-slate-600 dark:text-slate-300">{nextInstruction.text}</p>
              )}
              {previewMode ? (
                <p className="mt-1 text-[12px] text-slate-500">Live step-by-step guidance starts when you arrive at {iata}.</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setShowInstructions((open) => !open)}
                className="min-h-[48px] rounded-2xl bg-slate-100 px-3 text-[13px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {showInstructions ? "Hide" : "Steps"}
              </button>
              <button
                type="button"
                onClick={endRoute}
                className="min-h-[48px] rounded-2xl bg-slate-100 px-3 text-[13px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
          {showInstructions && (
            <ol className="mt-3 max-h-[18dvh] space-y-2 overflow-y-auto overscroll-contain border-t border-slate-200 pt-3 touch-pan-y [-webkit-overflow-scrolling:touch] dark:border-slate-700">
              {activeRoute.instructions.map((step, stepIdx) => (
                <li key={`${step.maneuver}-${step.atMeters}-${stepIdx}`} className="flex gap-2 text-[16px] leading-snug text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{stepIdx + 1}.</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Guide-me CTA when idle */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && !activeRoute && layout && gatePoi && (
        <div style={{ bottom: bottomPanel }} className="absolute inset-x-3">
          <button
            type="button"
            onClick={() => startRoute(gatePoi.id)}
            className="w-full rounded-2xl bg-sky-600 py-2.5 text-sm font-bold text-white shadow-xl"
          >
            🧭 Guide me to {gateCode ? `Gate ${gateCode.toUpperCase()}` : "my gate"}
          </button>
        </div>
      )}

      {activeRally?.status === "active" ? (
        <div
          data-testid="airport-rally-banner"
          className="pointer-events-none absolute inset-x-3 z-20 flex justify-center"
          style={{ top: "max(5.5rem, calc(env(safe-area-inset-top) + 5rem))" }}
        >
          <p className="rounded-full border border-[#f4c95d]/50 bg-[#f4c95d]/15 px-4 py-1.5 text-[11px] font-bold text-[#f4c95d] backdrop-blur">
            📍 Rally: {activeRally.target.label}
          </p>
        </div>
      ) : null}

      {familyPins.length > 0 && (
        <div
          data-testid="airport-family-chip-strip"
          className="pointer-events-auto absolute left-3 z-[60] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2"
          style={{ bottom: bottomFamily }}
        >
          <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200/90 backdrop-blur">
            👪 Family here
          </span>
          {familyPins.map((pin) => (
            <button
              key={pin.memberId}
              type="button"
              data-testid={`airport-family-chip-${pin.memberId}`}
              onClick={() => onFamilyPinTap?.(pin.memberId)}
              className="rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur active:opacity-90"
              style={{ opacity: pin.stale ? 0.65 : 1 }}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ background: pin.stale ? "#64748b" : pin.color }}
              />
              {pin.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
