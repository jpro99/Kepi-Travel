"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreCspWorker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirportLayout, ComputedRoute, PoiDefinition, SnappedPosition, TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { computeRoute, resolveGateNode, snapToGraph } from "@/lib/airportNav/pathfinder";
import {
  initialJourneyState,
  phaseStatusLine,
  stepJourney,
  type JourneyEvent,
  type JourneyPhaseId,
  type JourneyPrompt,
} from "@/lib/airportNav/journeyMachine";
import { routeVoiceIntent } from "@/lib/airportNav/intentRouter";

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
  minutesToDeparture: number;
  userLat: number | null;
  userLon: number | null;
  credentials: TravelerSecurityCredentials;
  onCredentialsAnswer: (creds: { tsaPreCheck: boolean; clear: boolean }) => void;
  /** Lounge names the traveler can access via airline status (AirportMode). */
  eligibleLoungeNames?: string[];
}

const COLOR = {
  canvas: "#0b1f3a",
  landside: "#27405f",
  airside: "#1d3557",
};

const PATH_DIM = "#3b4f6b";
const PATH_WARM = "#f4c95d";
const PATH_WARM_BRIGHT = "#ffe29a";

const POI_ICON: Record<PoiDefinition["category"], string> = {
  gate: "🛫",
  checkin: "🧳",
  security: "🛡",
  lounge: "🛋",
  restroom: "🚻",
  train: "🚈",
  baggage: "🎒",
};

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

export function AirportNavigatorMap({
  iata,
  gateCode,
  airlineName,
  minutesToDeparture,
  userLat,
  userLon,
  credentials,
  onCredentialsAnswer,
  eligibleLoungeNames = [],
}: AirportNavigatorMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poiMarkersRef = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);

  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ComputedRoute | null>(null);
  const [activeDestName, setActiveDestName] = useState<string | null>(null);
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Journey machine (single source of truth for "where in the journey")
  const journeyRef = useRef(initialJourneyState(Date.now()));
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhaseId>("landside");
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

  /* ── Journey event processing ───────────────────────────────────────── */
  const processJourneyEvent = useCallback(
    (event: JourneyEvent) => {
      if (!layout) return;
      const result = stepJourney(layout, journeyRef.current, event);
      journeyRef.current = result.state;
      setJourneyPhase(result.state.phase);
      if (result.prompt) setJourneyPrompt(result.prompt);
      else if (result.state.openPromptId === null) setJourneyPrompt(null);
      if (result.announce) {
        setStatusLine(result.announce);
        sayAndShow(result.announce);
      }
      if (result.suggestObjective) setObjective(result.suggestObjective);
    },
    [layout, sayAndShow],
  );

  /* ── Load curated layout ────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setLayoutError(false);
    void fetch(`/api/airport-nav/${encodeURIComponent(iata)}/layout`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: AirportLayout) => {
        if (!cancelled) setLayout(data);
      })
      .catch(() => {
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [iata]);

  /* ── Snapped traveler position ──────────────────────────────────────── */
  const snapped: SnappedPosition | null = useMemo(() => {
    if (!layout || userLat === null || userLon === null) return null;
    return snapToGraph(layout, userLon, userLat);
  }, [layout, userLat, userLon]);

  const originNodeId = useMemo(() => {
    if (snapped) return snapped.nearestNodeId;
    if (!layout) return null;
    return layout.nodes.find((node) => node.kind === "junction" && !node.airside)?.id
      ?? layout.nodes[0]?.id
      ?? null;
  }, [snapped, layout]);

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
      if (isAirsidePoi(targetPoi) && !credentials.known && !journeyRef.current.throughSecurity) {
        setPendingPoiId(poiId);
        if (viaVoice) sayAndShow("Quick one — do you have TSA PreCheck, CLEAR, or both?");
        return;
      }
      const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: poiId, credentials });
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
    [layout, originNodeId, credentials, sayAndShow],
  );

  const endRoute = useCallback(() => {
    setActiveRoute(null);
    setActiveDestName(null);
    lastInstructionIdxRef.current = -1;
    setCurrentStepIdx(0);
  }, []);

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
    const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: targetPoi.id, credentials });
    setActiveRoute(route);
    setActiveDestName(route ? targetPoi.name : null);
    lastInstructionIdxRef.current = -1;
    setCurrentStepIdx(0);
  }, [credentials, pendingPoiId, layout, originNodeId]);

  // Re-route from new position as the traveler moves
  useEffect(() => {
    if (!activeRoute || !layout || !originNodeId) return;
    if (activeRoute.fromNodeId === originNodeId) return;
    const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: activeRoute.toPoiId, credentials });
    if (route) setActiveRoute(route);
  }, [originNodeId, activeRoute, layout, credentials]);

  /* ── Journey: position + clock events ───────────────────────────────── */
  useEffect(() => {
    if (!snapped) return;
    processJourneyEvent({
      type: "position",
      nodeId: snapped.nearestNodeId,
      confidence: snapped.confidence,
      at: Date.now(),
    });
  }, [snapped?.nearestNodeId, snapped?.confidence, processJourneyEvent]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ── Voice co-pilot ─────────────────────────────────────────────────── */
  const bestLoungePoi = useCallback((): PoiDefinition | null => {
    if (!layout || !originNodeId) return null;
    const loungePois = layout.pois.filter((poi) => poi.category === "lounge");
    if (loungePois.length === 0) return null;
    const scored = loungePois
      .map((poi) => {
        const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: poi.id, credentials });
        return route
          ? { poi, seconds: route.totalSeconds, eligible: loungeIsEligible(poi.name, eligibleLoungeNames) }
          : null;
      })
      .filter((entry): entry is { poi: PoiDefinition; seconds: number; eligible: boolean } => entry !== null)
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.seconds - b.seconds);
    return scored[0]?.poi ?? null;
  }, [layout, originNodeId, credentials, eligibleLoungeNames]);

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
            const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: gatePoi.id, credentials });
            if (route) {
              sayAndShow(`About ${fmtMins(route.totalSeconds)} to ${gateCode ? `Gate ${gateCode.toUpperCase()}` : "your gate"}.`);
              return;
            }
          }
          sayAndShow("Start a route and I'll keep you posted on timing.");
          return;
        }
        case "cancel": {
          endRoute();
          sayAndShow("Navigation ended.");
          return;
        }
        default:
          sayAndShow("I can take you to your gate, a lounge, security, check-in, or a restroom.");
      }
    },
    [gatePoi, gateCode, layout, originNodeId, credentials, activeRoute, activeDestName, statusLine, eligibleLoungeNames, startRoute, endRoute, answerCredentials, bestLoungePoi, securityPoi, sayAndShow, showSubtitle],
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
    if (journeyPhase !== "lounge" || !gatePoi || !layout || !originNodeId) return null;
    const route = computeRoute({ layout, fromNodeId: originNodeId, toPoiId: gatePoi.id, credentials });
    if (!route) return null;
    const leaveByMs = Date.now() + minutesRounded * 60_000 - route.totalSeconds * 1000 - 15 * 60_000;
    if (leaveByMs <= Date.now()) return "Leave now";
    return `Leave by ${fmtClock(leaveByMs)}`;
  }, [journeyPhase, gatePoi, layout, originNodeId, credentials, minutesRounded]);

  /* ── Map init (dark schematic canvas, no remote style) ──────────────── */
  useEffect(() => {
    if (!mapEl.current || mapRef.current || !layout) return;
    let disposed = false;
    void import("maplibre-gl").then((ml) => {
      if (disposed || !mapEl.current || mapRef.current) return;
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
        attributionControl: false,
        dragRotate: true,
      });
      mapRef.current = map;
      map.on("load", () => {
        if (disposed) return;
        addLayoutLayers(map, layout);
        setMapReady(true);
      });
    });
    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      poiMarkersRef.current = {};
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, [layout]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addLayoutLayers(map: any, lay: AirportLayout) {
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
      for (const poi of layout.pois) {
        if (poi.category === "checkin" && poi.airline && airlineName && !airlineName.toLowerCase().includes(poi.airline.toLowerCase())) {
          continue;
        }
        if (poi.category === "checkin" && poi.airline && !airlineName) continue;
        const pos = nodePos.get(poi.nodeId);
        if (!pos) continue;

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
          "box-shadow:0 4px 14px rgba(0,0,0,0.35);",
          critical || urgent ? "animation:kepiPulse 1.6s ease-in-out infinite;" : "",
        ].join("");
        const gateLabel = isGateBubble && gateCode ? `Gate ${gateCode.toUpperCase()}` : poi.name;
        const countdown = isGateBubble && minutesRounded > 0 && minutesRounded < 600 ? ` · ${minutesRounded}m` : "";
        const accessMark = eligibleLounge ? " ✓" : "";
        bubble.textContent = `${POI_ICON[poi.category]} ${gateLabel}${countdown}${accessMark}`;
        bubble.addEventListener("click", () => startRoute(poi.id));

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
  }, [mapReady, layout, gatePoi, gateCode, minutesRounded, airlineName, objective, eligibleLoungeNames, startRoute]);

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
      const haloPx = Math.round(26 + (1 - snapped.confidence) * 50);
      if (!userMarkerRef.current) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;display:flex;align-items:center;justify-content:center;";
        const halo = document.createElement("div");
        halo.dataset.role = "halo";
        const dot = document.createElement("div");
        dot.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#38bdf8;border:2.5px solid #fff;box-shadow:0 0 10px rgba(56,189,248,0.9);position:relative;z-index:1;";
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
  }, [mapReady, snapped]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (layoutError) return null;

  const quietMode = journeyPhase === "security";
  const nextInstruction = activeRoute?.instructions[Math.min(currentStepIdx, Math.max(0, (activeRoute?.instructions.length ?? 1) - 1))] ?? null;
  const securityQuestionOpen = pendingPoiId !== null && !credentials.known;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1f3a]" style={{ height: 420 }}>
      <style>{`@keyframes kepiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes kepiMicRing{0%{box-shadow:0 0 0 0 rgba(56,189,248,0.55)}100%{box-shadow:0 0 0 14px rgba(56,189,248,0)}}`}</style>
      <div ref={mapEl} className="absolute inset-0" />

      {/* Header strip: status line + confidence + leave-by */}
      <div className="pointer-events-none absolute left-3 top-3 right-3 flex items-start justify-between gap-2">
        <div className="rounded-xl bg-black/45 px-3 py-1.5 backdrop-blur">
          <p className="text-[11px] font-bold text-white">
            {statusLine ?? phaseStatusLine(journeyPhase, gateCode)}
          </p>
          <p className="text-[9px] text-sky-200/80">
            {layout?.name ?? iata} · Layout beta
            {snapped ? ` · confidence ${Math.round(snapped.confidence * 100)}%` : " · locating…"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {leaveByLabel && (
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
      {!layout && !layoutError && (
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

      {/* Mic — press and hold, thumb zone */}
      {layout && (
        <button
          type="button"
          aria-label="Hold to talk to Kepi"
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          className="absolute bottom-16 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-xl"
          style={{
            background: listening ? "#38bdf8" : "rgba(255,255,255,0.92)",
            animation: listening ? "kepiMicRing 1.2s ease-out infinite" : undefined,
          }}
        >
          🎙
        </button>
      )}

      {/* Journey prompt (e.g. "Are you through security yet?") */}
      {journeyPrompt && !securityQuestionOpen && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
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
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
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
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/55 p-3 text-center backdrop-blur">
          <p className="text-[11px] font-semibold text-sky-100">
            We&apos;ll pick up on the other side.
            {gateCode ? ` Gate ${gateCode.toUpperCase()} after security.` : ""}
          </p>
        </div>
      )}

      {/* Active route card */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && activeRoute && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                → {activeDestName} · {fmtMins(activeRoute.totalSeconds)}
                {activeRoute.laneUsed ? ` · ${activeRoute.laneUsed === "precheck" ? "PreCheck" : activeRoute.laneUsed === "clear" ? "CLEAR" : "standard"} lane` : ""}
              </p>
              {nextInstruction && (
                <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-300">{nextInstruction.text}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => setShowInstructions((open) => !open)}
                className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {showInstructions ? "Hide" : "Steps"}
              </button>
              <button
                type="button"
                onClick={endRoute}
                className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                End
              </button>
            </div>
          </div>
          {showInstructions && (
            <ol className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {activeRoute.instructions.map((step, stepIdx) => (
                <li key={`${step.maneuver}-${step.atMeters}-${stepIdx}`} className="text-[11px] text-slate-600 dark:text-slate-300">
                  {stepIdx + 1}. {step.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Guide-me CTA when idle */}
      {!securityQuestionOpen && !journeyPrompt && !quietMode && !activeRoute && layout && gatePoi && (
        <div className="absolute inset-x-3 bottom-3">
          <button
            type="button"
            onClick={() => startRoute(gatePoi.id)}
            className="w-full rounded-2xl bg-sky-600 py-2.5 text-sm font-bold text-white shadow-xl"
          >
            🧭 Guide me to {gateCode ? `Gate ${gateCode.toUpperCase()}` : "my gate"}
          </button>
        </div>
      )}
    </div>
  );
}
