/**
 * Kepi Airport Navigator — local voice intent router (Phase 1, spec §D5).
 *
 * Pure function: utterance string → VoiceIntent. Runs on-device with zero
 * latency and no connectivity, covering the core navigation intents.
 * Anything it can't resolve returns { intent: "unknown" } — the Claude
 * fallthrough endpoint handles those in a later phase.
 */

export type VoiceIntentKind =
  | "navigate_gate"
  | "navigate_lounge"
  | "navigate_security"
  | "navigate_checkin"
  | "navigate_restroom"
  | "navigate_train"
  | "set_credentials"
  | "next_step"
  | "eta"
  | "sprint"
  | "cancel"
  | "unknown";

export interface VoiceIntent {
  intent: VoiceIntentKind;
  /** Only for set_credentials. */
  credentials?: { tsaPreCheck: boolean; clear: boolean };
  /** Normalized utterance, for logging/debug. */
  utterance: string;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\bpre[- ]?check\b/g, "precheck")
    .replace(/\btsa precheck\b/g, "precheck")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Credential parsing handles the conversational answers from spec §B Flow 2:
 *  "I have precheck and clear" / "only clear, no precheck" / "both" /
 *  "neither" / "no" / "I don't have either" / "just precheck"
 */
function parseCredentials(text: string): { tsaPreCheck: boolean; clear: boolean } | null {
  const mentionsPre = /\bprecheck\b/.test(text);
  const mentionsClear = /\bclear\b/.test(text);
  const both = /\bboth\b/.test(text);
  const neither = /\b(neither|none|nothing|no i don'?t|don'?t have (either|any|one))\b/.test(text);
  const only = /\b(only|just)\b/.test(text);
  const negated = (word: string) =>
    new RegExp(`\\b(no|not|don'?t have|without)\\b[^.]{0,12}\\b${word}\\b`).test(text);

  if (neither && !mentionsPre && !mentionsClear) return { tsaPreCheck: false, clear: false };
  if (both && !mentionsPre && !mentionsClear) return { tsaPreCheck: true, clear: true };

  if (!mentionsPre && !mentionsClear) {
    // Bare "yes"/"no" style answers — only meaningful as a follow-up;
    // treat bare "no"/"nope" as neither.
    if (/^(no|nope|nah)\b/.test(text)) return { tsaPreCheck: false, clear: false };
    return null;
  }

  let pre = mentionsPre ? !negated("precheck") : false;
  let clr = mentionsClear ? !negated("clear") : false;
  if (both) {
    pre = true;
    clr = true;
  }
  if (only) {
    // "only clear" → the unmentioned one is explicitly false
    if (mentionsClear && !mentionsPre) pre = false;
    if (mentionsPre && !mentionsClear) clr = false;
  }
  return { tsaPreCheck: pre, clear: clr };
}

export function routeVoiceIntent(rawUtterance: string): VoiceIntent {
  const text = normalize(rawUtterance);
  const utterance = text;
  if (!text) return { intent: "unknown", utterance };

  // Cancel / stop
  if (/\b(stop|cancel|end (the )?(route|navigation)|never ?mind)\b/.test(text)) {
    return { intent: "cancel", utterance };
  }

  // Sprint — running late beats everything except cancel
  if (/\b(running late|i'?m late|fastest|quickest|hurry|sprint|gonna miss)\b/.test(text)) {
    return { intent: "sprint", utterance };
  }

  // Credentials — check BEFORE navigate_security ("I have precheck" must not
  // be read as "take me to security"), but only when phrased as having/not
  // having, not as a destination.
  const looksLikeCredentialAnswer =
    /\b(i (have|got|only have|don'?t have)|i'?ve got|both|neither|just|only)\b/.test(text) ||
    /^(no|nope|nah|yes|yeah)\b/.test(text) ||
    (/\b(precheck|clear)\b/.test(text) && !/\b(where|take|go|route|navigate|find)\b/.test(text));
  if (looksLikeCredentialAnswer) {
    const creds = parseCredentials(text);
    if (creds) return { intent: "set_credentials", credentials: creds, utterance };
  }

  // Status questions — BEFORE destination keywords: "how long to my gate"
  // is a question about the gate, not a command to navigate to it.
  if (/\b(next step|what now|what'?s next|where (do|should) i go|what do i do)\b/.test(text)) {
    return { intent: "next_step", utterance };
  }
  if (/\b(how (long|far)|eta|time (to|until)|am i going to make)\b/.test(text)) {
    return { intent: "eta", utterance };
  }

  // Navigation targets
  if (/\bgate\b/.test(text) || /\bboarding\b/.test(text)) {
    return { intent: "navigate_gate", utterance };
  }
  if (/\blounge\b/.test(text)) {
    return { intent: "navigate_lounge", utterance };
  }
  if (/\bsecurity\b/.test(text) || /\btsa\b/.test(text) || /\bcheckpoint\b/.test(text)) {
    return { intent: "navigate_security", utterance };
  }
  if (/\b(check ?in|bag drop|ticket(ing)? counter|kiosk)\b/.test(text)) {
    return { intent: "navigate_checkin", utterance };
  }
  if (/\b(restroom|bathroom|toilet|washroom)\b/.test(text)) {
    return { intent: "navigate_restroom", utterance };
  }
  if (/\btrain\b/.test(text) || /\bsatellite\b/.test(text)) {
    return { intent: "navigate_train", utterance };
  }

  return { intent: "unknown", utterance };
}
