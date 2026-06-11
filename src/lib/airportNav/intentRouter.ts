import type { VoiceNavIntent } from "./types";

const PRECHECK_PATTERNS = [
  /\bpre[\s-]?check\b/i,
  /\btsa pre\b/i,
  /\bglobal entry\b/i,
];
const CLEAR_PATTERNS = [/\bclear\b/i, /\bclear\+?\b/i];
const BOTH_PATTERNS = [/\bboth\b/i, /pre[\s-]?check and clear/i, /clear and pre/i];
const NEITHER_PATTERNS = [/\bneither\b/i, /\bstandard\b/i, /\bno precheck\b/i, /\bregular security\b/i];

export function routeLocalVoiceIntent(utterance: string): VoiceNavIntent | null {
  const text = utterance.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  if (/take me to (my )?gate|go to (my )?gate|navigate to gate/.test(lower)) {
    return {
      intent: "navigate_gate",
      slots: {},
      confidence: 0.95,
      source: "local_router",
      spokenResponse: "Routing to your gate.",
    };
  }

  if (/running late|fastest route|sprint|hurry/.test(lower)) {
    return {
      intent: "sprint",
      slots: { on: true },
      confidence: 0.9,
      source: "local_router",
      spokenResponse: "Switching to fastest route.",
    };
  }

  if (/what('s| is) my next step|what do i do now|what next/.test(lower)) {
    return {
      intent: "next_step",
      slots: {},
      confidence: 0.92,
      source: "local_router",
    };
  }

  if (/through security|i'?m through|past security|made it through/.test(lower)) {
    return {
      intent: "confirm_phase",
      slots: { phaseId: "airside" },
      confidence: 0.88,
      source: "local_router",
      spokenResponse: "Great — continuing on the airside side of security.",
    };
  }

  if (/lounge|club|centurion|admirals/.test(lower)) {
    return {
      intent: "lounge_query",
      slots: { utterance: text },
      confidence: 0.85,
      source: "local_router",
    };
  }

  if (/where('s| is) .*(spouse|partner|wife|husband|stephanie)/.test(lower)) {
    return {
      intent: "find_companion",
      slots: {},
      confidence: 0.86,
      source: "local_router",
    };
  }

  if (BOTH_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: "set_credentials",
      slots: { tsaPreCheck: true, clear: true },
      confidence: 0.93,
      source: "local_router",
      spokenResponse: "Got it — routing to the CLEAR plus PreCheck entrance.",
    };
  }

  if (CLEAR_PATTERNS.some((pattern) => pattern.test(text)) &&
      !PRECHECK_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: "set_credentials",
      slots: { tsaPreCheck: false, clear: true },
      confidence: 0.9,
      source: "local_router",
      spokenResponse: "Routing to the CLEAR lane.",
    };
  }

  if (PRECHECK_PATTERNS.some((pattern) => pattern.test(text)) &&
      !CLEAR_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: "set_credentials",
      slots: { tsaPreCheck: true, clear: false },
      confidence: 0.9,
      source: "local_router",
      spokenResponse: "Routing to the TSA PreCheck lane.",
    };
  }

  if (/only have clear|just clear|don't have precheck|do not have precheck/.test(lower)) {
    return {
      intent: "set_credentials",
      slots: { tsaPreCheck: false, clear: true },
      confidence: 0.94,
      source: "local_router",
      spokenResponse: "Clear only — updating your security route.",
    };
  }

  if (NEITHER_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: "set_credentials",
      slots: { tsaPreCheck: false, clear: false },
      confidence: 0.88,
      source: "local_router",
      spokenResponse: "Routing to standard security.",
    };
  }

  if (/security|pre[\s-]?check|clear/.test(lower)) {
    return {
      intent: "set_credentials",
      slots: { utterance: text },
      confidence: 0.6,
      source: "local_router",
    };
  }

  return null;
}
