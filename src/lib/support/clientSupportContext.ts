/**
 * Live traveler context for Kepi Support — written by Airport Mode / travel shell,
 * read when the user opens support chat (G67).
 */

export type SupportLiveContext = {
  tripId?: string | null;
  tripName?: string | null;
  journeyPhase?: string | null;
  physicalAirportIata?: string | null;
  airportIata?: string | null;
  coachMode?: string | null;
  coachHeadline?: string | null;
  coachSteps?: string[];
  landedMinutesAgo?: number | null;
};

const STORAGE_KEY = "kepi:support-live-context";

let memoryContext: SupportLiveContext = {};

function readStorage(): SupportLiveContext {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SupportLiveContext;
  } catch {
    return {};
  }
}

export function setSupportLiveContext(patch: SupportLiveContext): void {
  memoryContext = { ...memoryContext, ...patch };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryContext));
  } catch {
    // sessionStorage may be blocked
  }
}

export function getSupportLiveContext(): SupportLiveContext {
  if (typeof window === "undefined") return memoryContext;
  const stored = readStorage();
  return { ...stored, ...memoryContext };
}

/** Plain-text block appended to support API trip context. */
export function formatClientSupportContext(): string {
  const ctx = getSupportLiveContext();
  const lines: string[] = [];

  if (ctx.tripName?.trim()) lines.push(`Active trip: ${ctx.tripName.trim()}`);
  if (ctx.tripId?.trim()) lines.push(`Trip id: ${ctx.tripId.trim()}`);
  if (ctx.journeyPhase?.trim()) lines.push(`Journey phase: ${ctx.journeyPhase.trim()}`);
  if (ctx.physicalAirportIata?.trim()) {
    lines.push(`GPS airport campus: ${ctx.physicalAirportIata.trim().toUpperCase()}`);
  }
  if (ctx.airportIata?.trim()) {
    lines.push(`Airport mode IATA: ${ctx.airportIata.trim().toUpperCase()}`);
  }
  if (ctx.coachMode?.trim()) lines.push(`Coach mode: ${ctx.coachMode.trim()}`);
  if (ctx.coachHeadline?.trim()) lines.push(`Coach headline: ${ctx.coachHeadline.trim()}`);
  if (ctx.landedMinutesAgo != null && ctx.landedMinutesAgo >= 0) {
    lines.push(`Minutes since landing: ${ctx.landedMinutesAgo}`);
  }
  if (ctx.coachSteps?.length) {
    lines.push("Current coach steps (use these for baggage / train / connection answers):");
    ctx.coachSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  if (lines.length === 0) return "";
  return ["Live traveler context (from app — prefer over guesses):", ...lines].join("\n");
}
