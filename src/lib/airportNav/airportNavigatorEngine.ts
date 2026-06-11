import { generateId } from "@/lib/utils/generateId";
import { computeBoardingPressure, formatMinutesLabel } from "./boardingPressure";
import { evaluateLoungeEligibility } from "./loungeRules";
import {
  computeRoute,
  findNodeByRegion,
  haversineMeters,
  resolveSecurityLane,
  snapFixToGraph,
} from "./pathfinder3d";
import { fuseFix } from "./positionFusion";
import type {
  AirportTerminal3DModel,
  FlightNavContext,
  IndoorPositionFix,
  JourneyPhase,
  JourneyPhaseId,
  NavPrompt,
  NavigationPath,
  PathSegment,
  POIBubble,
  TravelerCredentials,
  VoiceNavIntent,
} from "./types";

export type NavAction =
  | { type: "LOAD_MODEL"; model: AirportTerminal3DModel }
  | { type: "SET_FLIGHT"; flight: FlightNavContext }
  | { type: "POSITION_FIX"; fix: IndoorPositionFix }
  | { type: "TAP_BUBBLE"; poiId: string }
  | { type: "NAVIGATE"; poiId: string }
  | { type: "VOICE_INTENT"; intent: VoiceNavIntent }
  | { type: "SET_CREDENTIALS"; credentials: Partial<TravelerCredentials> }
  | { type: "CONFIRM_PHASE"; phaseId: JourneyPhaseId }
  | { type: "GUIDE_NEXT" }
  | { type: "TOGGLE_SPRINT"; on: boolean }
  | { type: "DISMISS_PROMPT" }
  | { type: "RESERVATION_EVENT"; kind: "gate_change" | "boarding_start" | "boarding_close"; payload?: { gateCode?: string } };

export interface NavState {
  model: AirportTerminal3DModel | null;
  flight: FlightNavContext | null;
  phases: JourneyPhase[];
  activePhase: JourneyPhaseId;
  fix: IndoorPositionFix | null;
  path: NavigationPath | null;
  bubbles: POIBubble[];
  credentials: TravelerCredentials;
  sprint: boolean;
  quietMode: boolean;
  pendingPrompt: NavPrompt | null;
  subtitle: string | null;
  primaryObjectivePoiId: string | null;
  gateUrgency: "none" | "soon" | "critical";
}

type Listener = (state: NavState) => void;

const PHASE_ORDER: JourneyPhaseId[] = [
  "approach",
  "landside",
  "checkin",
  "security_queue",
  "security",
  "airside",
  "lounge",
  "to_gate",
  "at_gate",
];

function initialPhases(): JourneyPhase[] {
  return PHASE_ORDER.map((id, index) => ({
    id,
    status: index === 1 ? "active" : index === 0 ? "completed" : "pending",
    enteredAt: index <= 1 ? new Date().toISOString() : undefined,
  }));
}

function credentialsUnknown(credentials: TravelerCredentials): boolean {
  return credentials.tsaPreCheck === "unknown" && credentials.clear === "unknown";
}

export class AirportNavigatorEngine {
  private navState: NavState;
  private listeners: Listener[] = [];

  constructor(initial?: Partial<NavState>) {
    this.navState = {
      model: null,
      flight: null,
      phases: initialPhases(),
      activePhase: "landside",
      fix: null,
      path: null,
      bubbles: [],
      credentials: {
        tsaPreCheck: "unknown",
        clear: "unknown",
        globalEntry: "unknown",
      },
      sprint: false,
      quietMode: false,
      pendingPrompt: null,
      subtitle: null,
      primaryObjectivePoiId: null,
      gateUrgency: "none",
      ...initial,
    };
  }

  getState(): NavState {
    return this.navState;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    listener(this.navState);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  dispatch(action: NavAction): void {
    switch (action.type) {
      case "LOAD_MODEL":
        this.navState.model = action.model;
        this.refreshBubbles();
        break;
      case "SET_FLIGHT":
        this.navState.flight = action.flight;
        this.refreshBubbles();
        break;
      case "POSITION_FIX":
        this.onFix(action.fix);
        break;
      case "TAP_BUBBLE":
        this.onTapBubble(action.poiId);
        break;
      case "NAVIGATE":
        this.navigateTo(action.poiId);
        break;
      case "VOICE_INTENT":
        this.onVoice(action.intent);
        break;
      case "SET_CREDENTIALS":
        this.onCredentials(action.credentials);
        break;
      case "CONFIRM_PHASE":
        this.advancePhase(action.phaseId, "user");
        break;
      case "GUIDE_NEXT":
        this.guideToNextObjective();
        break;
      case "TOGGLE_SPRINT":
        this.navState.sprint = action.on;
        this.recomputePath();
        break;
      case "DISMISS_PROMPT":
        this.navState.pendingPrompt = null;
        break;
      case "RESERVATION_EVENT":
        this.onReservationEvent(action);
        break;
    }
    this.emit();
  }

  private onFix(rawFix: IndoorPositionFix): void {
    const fused = fuseFix(
      this.navState.fix,
      rawFix,
      this.navState.model?.graph ?? null,
    );
    const snapped = this.navState.model
      ? snapFixToGraph(this.navState.model, fused)
      : fused;
    this.navState.fix = snapped;
    this.detectPhaseTransition(snapped);
    this.updatePathProgress(snapped);
    if (snapped.confidence < 0.45) {
      this.maybeAskCheckpoint();
    }
    this.refreshBubbles();
  }

  private onTapBubble(poiId: string): void {
    const bubble = this.navState.bubbles.find((entry) => entry.poiId === poiId);
    if (!bubble) return;
    if (bubble.tapAction.type === "ask_credentials") {
      this.promptCredentials();
      return;
    }
    this.navigateTo(poiId);
  }

  private onVoice(intent: VoiceNavIntent): void {
    if (intent.spokenResponse) {
      this.navState.subtitle = intent.spokenResponse;
    }

    switch (intent.intent) {
      case "navigate_gate": {
        const gatePoi = this.resolveGatePoiId();
        if (gatePoi) this.navigateTo(gatePoi);
        break;
      }
      case "navigate_poi": {
        const target = String(intent.slots.poiId ?? "");
        if (target) this.navigateTo(target);
        break;
      }
      case "set_credentials":
        this.onCredentials({
          tsaPreCheck:
            intent.slots.tsaPreCheck === true
              ? true
              : intent.slots.tsaPreCheck === false
                ? false
                : undefined,
          clear:
            intent.slots.clear === true
              ? true
              : intent.slots.clear === false
                ? false
                : undefined,
        });
        break;
      case "next_step":
        this.navState.subtitle = this.describeNextStep();
        break;
      case "sprint":
        this.navState.sprint = intent.slots.on !== false;
        this.recomputePath();
        break;
      case "confirm_phase":
        this.advancePhase(
          (intent.slots.phaseId as JourneyPhaseId) ?? "airside",
          "voice",
        );
        break;
      case "lounge_query":
        this.handleLoungeQuery();
        break;
      default:
        break;
    }
  }

  private onCredentials(partial: Partial<TravelerCredentials>): void {
    this.navState.credentials = {
      ...this.navState.credentials,
      ...partial,
      askedAt: new Date().toISOString(),
    };
    this.navState.pendingPrompt = null;
    if (this.navState.path) {
      this.recomputePath();
    } else {
      this.guideToNextObjective();
    }
    const lane = resolveSecurityLane(this.navState.credentials);
    this.navState.subtitle = `Routing to ${lane.replace("_", " ")} security.`;
  }

  private onReservationEvent(
    action: Extract<NavAction, { type: "RESERVATION_EVENT" }>,
  ): void {
    if (action.kind === "gate_change" && action.payload?.gateCode && this.navState.flight) {
      this.navState.flight = {
        ...this.navState.flight,
        gateCode: action.payload.gateCode,
      };
      this.refreshBubbles();
      this.recomputePath();
      this.navState.subtitle = `Gate changed to ${action.payload.gateCode}. Path updated.`;
    }
    if (action.kind === "boarding_start") {
      this.bumpGateUrgency("soon");
    }
    if (action.kind === "boarding_close") {
      this.bumpGateUrgency("critical");
    }
  }

  private navigateTo(poiId: string): void {
    const { model, fix, credentials, sprint } = this.navState;
    if (!model || !fix) return;

    if (
      poiId === "poi-security" &&
      credentialsUnknown(credentials) &&
      this.isPreSecurity()
    ) {
      this.promptCredentials();
      return;
    }

    const resolvedPoiId = this.resolveNavigationTarget(poiId);

    const path = computeRoute({
      model,
      fix,
      toPoiId: resolvedPoiId,
      credentials,
      profile: sprint ? "sprint" : "default",
    });
    this.navState.path = path;
    this.navState.primaryObjectivePoiId = poiId;
    this.navState.quietMode =
      poiId === "poi-security" || this.navState.activePhase === "security";
    this.rerankBubbles(poiId);
    if (path?.segments[0]) {
      this.navState.subtitle = path.segments[0].instruction.text;
    }
  }

  /** Map generic security POI to lane-specific graph target. */
  private resolveNavigationTarget(poiId: string): string {
    if (poiId !== "poi-security" || !this.navState.model) return poiId;
    const lane = resolveSecurityLane(this.navState.credentials);
    const laneEntryMap: Record<string, string> = {
      standard: "poi-security-standard",
      precheck: "poi-security-precheck",
      clear: "poi-security-clear",
      clear_precheck: "poi-security-both",
      priority: "poi-security-precheck",
    };
    return laneEntryMap[lane] ?? poiId;
  }

  private guideToNextObjective(): void {
    const nextPoi = this.nextObjectivePoiId();
    if (nextPoi) {
      this.navigateTo(nextPoi);
    }
  }

  private nextObjectivePoiId(): string | null {
    const phase = this.navState.activePhase;
    if (phase === "landside" || phase === "checkin") {
      return this.navState.flight?.airline === "United"
        ? "poi-checkin-united"
        : "poi-checkin-main";
    }
    if (phase === "security_queue" || phase === "security") {
      return "poi-security";
    }
    if (phase === "airside" || phase === "lounge" || phase === "to_gate") {
      return this.resolveGatePoiId();
    }
    return this.resolveGatePoiId();
  }

  private resolveGatePoiId(): string | null {
    const gateCode = this.navState.flight?.gateCode;
    if (!gateCode || !this.navState.model) return "poi-gate-b32";
    const normalized = gateCode.toUpperCase();
    const match = this.navState.model.pois.find(
      (poi) => poi.gateCode?.toUpperCase() === normalized,
    );
    return match?.id ?? "poi-gate-b32";
  }

  private detectPhaseTransition(fix: IndoorPositionFix): void {
    const model = this.navState.model;
    if (!model || !fix.snappedNodeId) return;

    const node = model.graph.nodes.find((entry) => entry.id === fix.snappedNodeId);
    if (!node?.region) return;

    if (node.region === "landside" && this.navState.activePhase === "approach") {
      this.advancePhase("landside", "geofence");
    }
    if (node.kind === "checkin" && this.isPreSecurity()) {
      this.advancePhase("checkin", "graph_region");
    }
    if (node.region === "security_queue") {
      this.advancePhase("security_queue", "graph_region");
    }
    if (node.kind === "security_entry") {
      this.advancePhase("security", "graph_region");
      this.navState.quietMode = true;
    }
    if (node.region === "airside" && this.navState.activePhase !== "airside") {
      this.advancePhase("airside", "graph_region");
      this.navState.quietMode = false;
      this.navState.subtitle = "You're through security. Head to your gate or a lounge.";
    }
    if (node.kind === "gate") {
      this.advancePhase("at_gate", "graph_region");
    }
  }

  private advancePhase(
    phaseId: JourneyPhaseId,
    confirmedBy: JourneyPhase["confirmedBy"],
  ): void {
    const now = new Date().toISOString();
    this.navState.phases = this.navState.phases.map((phase) => {
      if (phase.id === phaseId) {
        return { ...phase, status: "active", enteredAt: now, confirmedBy };
      }
      if (phase.status === "active" && phase.id !== phaseId) {
        return { ...phase, status: "completed", exitedAt: now };
      }
      return phase;
    });
    this.navState.activePhase = phaseId;
    if (phaseId === "airside") {
      this.navState.quietMode = false;
    }
    this.refreshBubbles();
  }

  private updatePathProgress(fix: IndoorPositionFix): void {
    const path = this.navState.path;
    if (!path || path.segments.length === 0) return;

    let activeIndex = 0;
    for (let index = 0; index < path.segments.length; index += 1) {
      const segment = path.segments[index];
      const coords = segment.geometry.coordinates;
      const end = coords[coords.length - 1];
      if (!end) continue;
      const dist = haversineMeters(fix.pos, {
        lng: end[0],
        lat: end[1],
        level: segment.level,
      });
      if (dist > 15) {
        activeIndex = index;
        break;
      }
      activeIndex = index + 1;
    }

    path.segments = path.segments.map((segment, index) => {
      let progress: PathSegment["progress"] = "upcoming";
      let warmth = 0.25;
      if (index < activeIndex) {
        progress = "completed";
        warmth = 0.15;
      } else if (index === activeIndex) {
        progress = "active";
        warmth = 1;
      } else if (index === activeIndex + 1) {
        warmth = 0.55;
      }
      return { ...segment, progress, warmth };
    });

    const activeSegment = path.segments[activeIndex];
    if (activeSegment?.progress === "active") {
      this.navState.subtitle = activeSegment.instruction.text;
    }
  }

  private maybeAskCheckpoint(): void {
    if (this.navState.pendingPrompt) return;
    if (this.navState.activePhase === "security") {
      this.navState.pendingPrompt = {
        id: generateId(),
        text: "Are you through security yet?",
        options: [
          { label: "Yes, I'm through", action: { type: "confirm_phase", phaseId: "airside" } },
          { label: "Still in line", action: { type: "dismiss" } },
        ],
      };
    }
  }

  private promptCredentials(): void {
    this.navState.pendingPrompt = {
      id: generateId(),
      text: "Do you have TSA PreCheck, CLEAR, or both?",
      options: [
        { label: "PreCheck", action: { type: "credentials", tsaPreCheck: true, clear: false } },
        { label: "CLEAR", action: { type: "credentials", tsaPreCheck: false, clear: true } },
        { label: "Both", action: { type: "credentials", tsaPreCheck: true, clear: true } },
        { label: "Neither", action: { type: "credentials", tsaPreCheck: false, clear: false } },
      ],
    };
  }

  private handleLoungeQuery(): void {
    const iata = this.navState.model?.iata ?? "SEA";
    const results = evaluateLoungeEligibility(
      iata,
      this.navState.credentials,
      this.navState.flight?.airline,
    );
    const eligible = results.filter((entry) => entry.eligible);
    if (eligible.length === 0) {
      this.navState.subtitle = "No lounge access detected on file — verify at the desk.";
      return;
    }
    const top = eligible[0];
    const poi = this.navState.model?.pois.find((entry) => entry.loungeId === top.loungeId);
    this.navState.subtitle = `You can use ${top.loungeId.replace("sea-", "").replace("-", " ")} via ${top.via}.`;
    if (poi) this.navigateTo(poi.id);
  }

  private describeNextStep(): string {
    const phase = this.navState.activePhase;
    if (phase === "checkin" || phase === "landside") {
      return "Next: check-in, then security.";
    }
    if (phase === "security_queue" || phase === "security") {
      return "Next: get through security, then head to your gate.";
    }
    if (phase === "airside") {
      const gate = this.navState.flight?.gateCode ?? "your gate";
      return `You're airside. Next: Gate ${gate}, or a lounge if you have time.`;
    }
    return "Follow the path on the map.";
  }

  private recomputePath(): void {
    if (this.navState.primaryObjectivePoiId) {
      this.navigateTo(this.navState.primaryObjectivePoiId);
    }
  }

  private rerankBubbles(primaryPoiId: string): void {
    this.navState.bubbles = this.navState.bubbles.map((bubble) => {
      if (bubble.poiId === primaryPoiId) {
        return { ...bubble, state: "primary" };
      }
      if (bubble.state === "primary") {
        return { ...bubble, state: "passive" };
      }
      return bubble;
    });
  }

  private refreshBubbles(): void {
    const model = this.navState.model;
    const flight = this.navState.flight;
    if (!model) {
      this.navState.bubbles = [];
      return;
    }

    const bpi = computeBoardingPressure({
      boardingCloseIso: flight?.boardingCloseIso,
      walkSeconds: this.navState.path?.totalSeconds ?? 540,
    });

    const gatePoiId = this.resolveGatePoiId();
    const preSecurity = this.isPreSecurity();

    const bubbles: POIBubble[] = model.pois.map((poi) => {
      let state: POIBubble["state"] = "passive";
      if (poi.id === gatePoiId) state = preSecurity ? "passive" : "next";
      if (poi.id === this.navState.primaryObjectivePoiId) state = "primary";
      if (poi.category === "lounge" && preSecurity) state = "hidden";
      if (poi.category === "checkin" && (this.navState.activePhase === "landside" || this.navState.activePhase === "checkin")) {
        state = poi.id === this.nextObjectivePoiId() ? "primary" : "next";
      }
      if (poi.category === "security" && (this.navState.activePhase === "checkin" || this.navState.activePhase === "security_queue")) {
        state = "next";
      }

      let liveLine: string | undefined;
      if (poi.category === "gate" && flight?.gateCode) {
        liveLine = bpi.secondsRemaining !== null
          ? `Boards in ${formatMinutesLabel(bpi.secondsRemaining)}`
          : `Gate ${flight.gateCode}`;
      }

      let urgency: POIBubble["urgency"] = "none";
      if (poi.id === gatePoiId) {
        urgency = this.navState.gateUrgency;
      }

      const eligibility =
        poi.category === "lounge" && poi.loungeId
          ? evaluateLoungeEligibility(model.iata, this.navState.credentials, flight?.airline).find(
              (entry) => entry.loungeId === poi.loungeId,
            )
          : undefined;

      if (poi.category === "lounge" && eligibility && !eligibility.eligible && !preSecurity) {
        state = state === "primary" ? "primary" : "ineligible";
      }

      return {
        poiId: poi.id,
        state,
        title: poi.name,
        liveLine,
        urgency,
        eligibility,
        tapAction:
          poi.category === "security" && credentialsUnknown(this.navState.credentials)
            ? { type: "ask_credentials" }
            : { type: "navigate" },
      };
    });

    this.navState.bubbles = bubbles.filter((bubble) => bubble.state !== "hidden");
  }

  private isPreSecurity(): boolean {
    return ["approach", "landside", "checkin", "security_queue", "security"].includes(
      this.navState.activePhase,
    );
  }

  private bumpGateUrgency(level: "soon" | "critical"): void {
    this.navState.gateUrgency = level;
    this.refreshBubbles();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.navState);
    }
  }
}

export function defaultSeaFlight(): FlightNavContext {
  const boarding = new Date(Date.now() + 72 * 60 * 1000);
  return {
    flightNumber: "UA1182",
    airline: "United",
    gateCode: "B32",
    terminal: "Main",
    boardingCloseIso: boarding.toISOString(),
    originIata: "SEA",
    destinationIata: "DEN",
  };
}

export function initialFixForAirport(model: AirportTerminal3DModel): IndoorPositionFix {
  const curb = findNodeByRegion(model, "landside") ?? model.graph.nodes[0];
  return {
    pos: { ...curb.pos },
    accuracyM: 18,
    confidence: 0.62,
    source: "gps_snap",
    snappedNodeId: curb.id,
    at: new Date().toISOString(),
  };
}
