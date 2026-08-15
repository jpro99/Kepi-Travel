/**
 * TripWalk — one Home execution card (G26).
 * Composes pickHomeNextAction + getLeaveByHint. Never invents drive time or walking-delta.
 */

import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { ConnectionCalmStatus } from "@/lib/travelAssistant/homeDayTruth";
import {
  pickHomeNextAction,
  type HomeNextAction,
  type HomePrepWatchItem,
} from "@/lib/travelAssistant/homeNextAction";
import type {
  AttentionItem,
  MissionControlReservation,
  ReadinessStatus,
} from "@/lib/travelAssistant/tripPhase";

export type TripWalkPhase =
  | "prep"
  | "leave_window"
  | "landside"
  | "airborne"
  | "arrival"
  | "city"
  | "disruption";

export interface GateChange {
  from: string;
  to: string;
}

export interface TripWalkOkay {
  ok: boolean;
  line: string;
}

export interface TripWalkBreak {
  id: string;
  title: string;
}

export interface TripWalk {
  phase: TripWalkPhase;
  okay: TripWalkOkay;
  next: HomeNextAction;
  leaveBy: string | null;
  canBreak: TripWalkBreak[];
  gateChange: GateChange | null;
}

export type TripWalkLocationStatus =
  | "away"
  | "at-airport"
  | "in-terminal"
  | "airborne"
  | "unknown";

/** Normalize a gate label: "gate c12" → "C12". Empty stays empty. */
export function normalizeGateRef(gate: string | undefined | null): string {
  return (gate ?? "")
    .trim()
    .toUpperCase()
    .replace(/^GATE\s+/u, "")
    .replace(/\s+/gu, "");
}

/**
 * Gate change is one event: both sides must be non-empty and differ.
 * Empty stored + live gate is an assignment, not a change.
 */
export function detectGateChange(
  stored: string | undefined | null,
  live: string | undefined | null,
): GateChange | null {
  const from = normalizeGateRef(stored);
  const to = normalizeGateRef(live);
  if (!from || !to || from === to) return null;
  return { from, to };
}

function gateChangeNext(change: GateChange): HomeNextAction {
  return {
    kind: "airport",
    eyebrow: "Gate changed",
    title: `Gate changed to ${change.to}`,
    detail: `Was ${change.from}. Open Airport Mode for the new gate.`,
    ctaLabel: "Open Airport Mode",
  };
}

function resolvePhase(input: {
  journeyKind?: JourneyPhase["kind"];
  locationStatus?: TripWalkLocationStatus;
  atAirport?: boolean;
  prepMode?: boolean;
  leaveByHint?: string | null;
  hasDisruptionAttention: boolean;
  gateChange: GateChange | null;
}): TripWalkPhase {
  if (input.journeyKind === "airborne") return "airborne";
  if (input.journeyKind === "just-landed") return "arrival";
  if (input.hasDisruptionAttention || (input.gateChange && !input.prepMode)) {
    return "disruption";
  }
  if (
    input.locationStatus === "at-airport" ||
    input.locationStatus === "in-terminal" ||
    input.atAirport
  ) {
    return "landside";
  }
  if (input.leaveByHint && !input.prepMode) return "leave_window";
  if (input.prepMode || input.journeyKind === "pre-trip") return "prep";
  return "city";
}

export function resolveTripWalk(input: {
  journeyPhase?: JourneyPhase;
  locationStatus?: TripWalkLocationStatus;
  openAirportMode?: boolean;
  atAirport?: boolean;
  attentionTop3: AttentionItem[];
  prepWatchItems?: HomePrepWatchItem[];
  prepMode?: boolean;
  unresolvedReviewCount?: number;
  nextFlight?: MissionControlReservation | null;
  leaveByHint?: string | null;
  liveDepartureGate?: string | null;
  storedDepartureGate?: string | null;
  connectionCalm?: ConnectionCalmStatus;
  tripStatus?: ReadinessStatus;
}): TripWalk {
  const stored =
    input.storedDepartureGate ?? input.nextFlight?.flightDepartureGate ?? null;
  const gateChange = detectGateChange(stored, input.liveDepartureGate);
  const hasDisruptionAttention = input.attentionTop3.some((item) => item.status === "problem");
  const needsYou = input.attentionTop3.some(
    (item) => item.status === "needs_you" || item.status === "problem",
  );
  const reviewCount = input.unresolvedReviewCount ?? 0;
  const connectionConflict = input.connectionCalm?.kind === "conflict";

  const phase = resolvePhase({
    journeyKind: input.journeyPhase?.kind,
    locationStatus: input.locationStatus,
    atAirport: input.atAirport,
    prepMode: input.prepMode,
    leaveByHint: input.leaveByHint,
    hasDisruptionAttention,
    gateChange,
  });

  const baseNext = pickHomeNextAction({
    openAirportMode: input.openAirportMode,
    atAirport: input.atAirport,
    attentionTop3: input.attentionTop3,
    prepWatchItems: input.prepWatchItems,
    prepMode: input.prepMode,
    unresolvedReviewCount: input.unresolvedReviewCount,
    nextFlight: input.nextFlight,
  });

  const next = gateChange && !input.prepMode ? gateChangeNext(gateChange) : baseNext;

  const canBreak: TripWalkBreak[] = [];
  if (gateChange) {
    canBreak.push({
      id: `gate-change-${gateChange.from}-${gateChange.to}`,
      title: `Gate changed to ${gateChange.to} (was ${gateChange.from})`,
    });
  }
  if (connectionConflict && input.connectionCalm?.line) {
    canBreak.push({ id: "connection-conflict", title: input.connectionCalm.line });
  }
  for (const item of input.attentionTop3) {
    if (canBreak.length >= 3) break;
    canBreak.push({ id: item.id, title: item.title });
  }
  if (canBreak.length < 3 && reviewCount > 0) {
    canBreak.push({
      id: "review-inbox",
      title:
        reviewCount === 1
          ? "1 booking waiting for your OK"
          : `${reviewCount} bookings waiting for your OK`,
    });
  }

  const ok = !(
    hasDisruptionAttention ||
    needsYou ||
    reviewCount > 0 ||
    Boolean(gateChange) ||
    connectionConflict
  );

  let okayLine = "You're set";
  if (gateChange) {
    okayLine = `Gate changed to ${gateChange.to}`;
  } else if (hasDisruptionAttention) {
    okayLine = input.attentionTop3.find((item) => item.status === "problem")?.title ?? "Action needed";
  } else if (needsYou) {
    okayLine = "This trip needs you";
  } else if (reviewCount > 0) {
    okayLine = "Bookings need your OK";
  } else if (connectionConflict) {
    okayLine = "A connection needs a look";
  }

  return {
    phase,
    okay: { ok, line: okayLine },
    next,
    leaveBy: input.leaveByHint ?? null,
    canBreak: canBreak.slice(0, 3),
    gateChange,
  };
}
