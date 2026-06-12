/**
 * Kepi Airport Navigator — journey state machine (Phase 1, spec §D4).
 *
 * Pure reducer: (state, event) → { state, prompt?, announce?, suggestion? }.
 * The single owner of "where is the traveler in the airport journey" —
 * position fixes, taps, voice answers, and the clock are all just events.
 *
 * Honesty rules encoded here:
 *  - Low-confidence position NEVER advances a phase silently; it asks
 *    ("Are you through security yet?") instead of guessing.
 *  - Going backwards (airside reading while landside-confirmed) is treated
 *    as GPS noise unless confidence is high.
 */

import type { AirportLayout, GraphNode } from "./types";

export type JourneyPhaseId =
  | "landside"
  | "checkin"
  | "security"
  | "airside"
  | "lounge"
  | "at_gate"
  | "boarding_soon";

export interface JourneyState {
  phase: JourneyPhaseId;
  enteredPhaseAt: number;
  /** Set once we are certain (high-confidence airside fix or user said yes). */
  throughSecurity: boolean;
  /** Pending question id so the UI shows it exactly once. */
  openPromptId: string | null;
  lastNodeId: string | null;
  /** Timestamp of the last "are you through security" ask — re-ask max 1/5min. */
  lastSecurityAskAt: number;
}

export type JourneyEvent =
  | {
      type: "position";
      nodeId: string;
      confidence: number;
      at: number;
    }
  | { type: "answer_through_security"; through: boolean; at: number }
  | { type: "arrived_at_route_end"; poiCategory: "gate" | "lounge" | "checkin" | "security" | "restroom" | "train" | "baggage"; at: number }
  | { type: "tick"; minutesToDeparture: number; at: number };

export interface JourneyPrompt {
  id: string;
  text: string;
  options: { label: string; event: JourneyEvent }[];
}

export interface JourneyStepResult {
  state: JourneyState;
  /** Question for the traveler (rendered as a card; answer feeds back as an event). */
  prompt?: JourneyPrompt;
  /** Short status line for the header + optional TTS. */
  announce?: string;
  /** POI category the UI should promote to the primary objective bubble. */
  suggestObjective?: "checkin" | "security" | "gate" | "lounge";
}

export function initialJourneyState(at: number): JourneyState {
  return {
    phase: "landside",
    enteredPhaseAt: at,
    throughSecurity: false,
    openPromptId: null,
    lastNodeId: null,
    lastSecurityAskAt: 0,
  };
}

const SECURITY_REASK_MS = 5 * 60_000;
const CONFIDENT = 0.6;

function nodeById(layout: AirportLayout, id: string): GraphNode | null {
  return layout.nodes.find((node) => node.id === id) ?? null;
}

function enter(state: JourneyState, phase: JourneyPhaseId, at: number): JourneyState {
  if (state.phase === phase) return state;
  return { ...state, phase, enteredPhaseAt: at, openPromptId: null };
}

const SECURITY_PROMPT_ID = "through-security";

function securityPrompt(at: number): JourneyPrompt {
  return {
    id: SECURITY_PROMPT_ID,
    text: "Are you through security yet?",
    options: [
      { label: "Yes, I'm through", event: { type: "answer_through_security", through: true, at } },
      { label: "Not yet", event: { type: "answer_through_security", through: false, at } },
    ],
  };
}

export function stepJourney(
  layout: AirportLayout,
  state: JourneyState,
  event: JourneyEvent,
): JourneyStepResult {
  switch (event.type) {
    case "position": {
      const node = nodeById(layout, event.nodeId);
      if (!node) return { state };
      const next: JourneyState = { ...state, lastNodeId: event.nodeId };

      // ── Airside detection ──
      if (node.airside) {
        if (state.throughSecurity || event.confidence >= CONFIDENT) {
          // Confident airside fix → we're through. Pick sub-phase by node kind.
          const through: JourneyState = { ...next, throughSecurity: true };
          if (node.kind === "lounge") {
            return {
              state: enter(through, "lounge", event.at),
              suggestObjective: "gate",
            };
          }
          if (node.kind === "gate") {
            return { state: enter(through, "at_gate", event.at) };
          }
          if (!state.throughSecurity) {
            // First confirmed airside moment — Flow 2 step 6
            return {
              state: enter(through, "airside", event.at),
              announce: "You're through security.",
              suggestObjective: "gate",
            };
          }
          if (state.phase === "landside" || state.phase === "checkin" || state.phase === "security") {
            return { state: enter(through, "airside", event.at), suggestObjective: "gate" };
          }
          return { state: through };
        }
        // Airside reading but LOW confidence and not yet confirmed → ask, don't guess.
        if (
          state.openPromptId !== SECURITY_PROMPT_ID &&
          event.at - state.lastSecurityAskAt > SECURITY_REASK_MS
        ) {
          return {
            state: { ...next, openPromptId: SECURITY_PROMPT_ID, lastSecurityAskAt: event.at },
            prompt: securityPrompt(event.at),
          };
        }
        return { state: next };
      }

      // ── Landside nodes ──
      if (state.throughSecurity) {
        // Backwards reading after confirmed airside — treat as noise unless
        // very confident (someone genuinely exiting security is rare mid-flow).
        if (event.confidence >= 0.85) {
          return {
            state: enter({ ...next, throughSecurity: false }, "landside", event.at),
            announce: "Looks like you're back landside.",
            suggestObjective: "security",
          };
        }
        return { state: next };
      }
      if (node.kind === "checkin") {
        const entered = enter(next, "checkin", event.at);
        if (state.phase !== "checkin") {
          return {
            state: entered,
            announce: "You're at check-in.",
            suggestObjective: "security",
          };
        }
        return { state: entered };
      }
      if (node.kind === "security_entry") {
        const entered = enter(next, "security", event.at);
        if (state.phase !== "security") {
          return { state: entered, announce: "At security — we'll pick up on the other side." };
        }
        return { state: entered };
      }
      return { state: enter(next, "landside", event.at), suggestObjective: state.phase === "landside" ? undefined : "security" };
    }

    case "answer_through_security": {
      if (event.through) {
        return {
          state: enter({ ...state, throughSecurity: true, openPromptId: null }, "airside", event.at),
          announce: "Great — you're airside.",
          suggestObjective: "gate",
        };
      }
      return {
        state: enter({ ...state, throughSecurity: false, openPromptId: null }, "security", event.at),
      };
    }

    case "arrived_at_route_end": {
      if (event.poiCategory === "gate") {
        return {
          state: enter({ ...state, throughSecurity: true }, "at_gate", event.at),
          announce: "You're at your gate.",
        };
      }
      if (event.poiCategory === "lounge") {
        return {
          state: enter({ ...state, throughSecurity: true }, "lounge", event.at),
          announce: "Enjoy the lounge — I'll tell you when it's time to head to the gate.",
        };
      }
      if (event.poiCategory === "checkin") {
        return { state: enter(state, "checkin", event.at), suggestObjective: "security" };
      }
      return { state };
    }

    case "tick": {
      const mins = event.minutesToDeparture;
      // Time-driven escalations (spec: calm urgency — only when it matters)
      if (state.phase === "lounge" && mins <= 40) {
        return {
          state: enter(state, "airside", event.at),
          announce: "Time to head to your gate.",
          suggestObjective: "gate",
        };
      }
      if (state.phase === "at_gate" && mins <= 25) {
        return { state: enter(state, "boarding_soon", event.at) };
      }
      if ((state.phase === "airside" || state.phase === "lounge") && mins <= 25) {
        return {
          state,
          announce: "Boarding soon — head to your gate now.",
          suggestObjective: "gate",
        };
      }
      return { state };
    }
  }
}

/** One-line header status per phase (UI + TTS share this). */
export function phaseStatusLine(phase: JourneyPhaseId, gateCode: string | null): string {
  const gate = gateCode ? `Gate ${gateCode.toUpperCase()}` : "your gate";
  switch (phase) {
    case "landside": return "Next: check-in or security";
    case "checkin": return "At check-in · next: security";
    case "security": return "At security · quiet mode";
    case "airside": return `Airside · next: ${gate}`;
    case "lounge": return "In the lounge · I'll watch the clock";
    case "at_gate": return `At ${gate} ✓`;
    case "boarding_soon": return "Boarding soon — stay close";
  }
}
