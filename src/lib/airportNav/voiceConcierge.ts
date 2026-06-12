/**
 * Kepi Airport Navigator — voice concierge core (spec §D5 Claude fall-through).
 *
 * Pure helpers shared by /api/airport-nav/voice-intent and tests:
 *  - buildAirportNavSystemPrompt / buildAirportNavUserMessage
 *  - parseConciergeResponse (robust JSON extraction + zod, never throws)
 *
 * The local intent router handles the 11 core commands on-device; anything
 * it can't resolve ("do I have time for lunch?", "which lounge is quietest?")
 * comes here with full journey context so Claude can answer with real math.
 */

import { z } from "zod";

export interface AirportNavContext {
  iata: string;
  airportName: string;
  journeyPhase: string;
  throughSecurity: boolean;
  gateCode: string | null;
  minutesToDeparture: number;
  /** From the Boarding Pressure Index. */
  pressureLine: string;
  pressureBreakdown: string;
  pressureVerdict: string;
  walkToGateMinutes: number | null;
  credentials: { tsaPreCheck: boolean; clear: boolean; known: boolean };
  eligibleLounges: string[];
  nearbyPois: string[];
  /** Curated prose from airportNavigation.ts for this airport (truncated). */
  airportNotes: string;
}

export const ConciergeActionSchema = z.enum([
  "none",
  "navigate_gate",
  "navigate_lounge",
  "navigate_security",
  "navigate_checkin",
  "navigate_restroom",
  "sprint",
]);

export const ConciergeResponseSchema = z.object({
  spoken: z.string().trim().min(1).max(420),
  action: ConciergeActionSchema.catch("none"),
});

export type ConciergeResponse = z.infer<typeof ConciergeResponseSchema>;

export const AIRPORT_NAV_SYSTEM_PROMPT = `You are Kepi, a calm, premium airport concierge speaking through a phone's voice assistant while the traveler walks through a terminal.

RULES:
- Respond ONLY with a JSON object: {"spoken": string, "action": string}
- "spoken" is read aloud via text-to-speech: max ~50 words, conversational, no markdown, no emoji, numbers as digits.
- "action" is one of: none, navigate_gate, navigate_lounge, navigate_security, navigate_checkin, navigate_restroom, sprint. Use a navigate action ONLY when the traveler clearly wants to GO somewhere now. Use "sprint" only if they're at risk of missing boarding AND want to move. Otherwise "none".
- Time math: use the Boarding Pressure data verbatim — never invent times, waits, or gate locations. If the data can't answer, say so honestly and suggest what you do know.
- Decline anything unrelated to this airport journey in one polite sentence.
- Calm urgency: state facts, never panic the traveler, never scold.`;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildAirportNavUserMessage(utterance: string, ctx: AirportNavContext): string {
  const lines = [
    `Airport: ${ctx.airportName} (${ctx.iata})`,
    `Journey phase: ${ctx.journeyPhase}${ctx.throughSecurity ? " (through security)" : " (NOT through security yet)"}`,
    `Gate: ${ctx.gateCode ?? "not assigned yet"}`,
    `Departs in: ${Math.round(ctx.minutesToDeparture)} min`,
    `Boarding pressure: ${ctx.pressureVerdict} — ${ctx.pressureLine}`,
    `Math: ${ctx.pressureBreakdown}`,
    ctx.walkToGateMinutes !== null ? `Walk to gate: ~${ctx.walkToGateMinutes} min` : "Walk to gate: unknown",
    `Security credentials: ${ctx.credentials.known ? `PreCheck=${ctx.credentials.tsaPreCheck}, CLEAR=${ctx.credentials.clear}` : "not asked yet"}`,
    ctx.eligibleLounges.length > 0 ? `Lounges with access: ${ctx.eligibleLounges.join(", ")}` : "Lounges with access: none known",
    ctx.nearbyPois.length > 0 ? `Mapped POIs: ${ctx.nearbyPois.join("; ")}` : "",
    ctx.airportNotes ? `Airport notes: ${clip(ctx.airportNotes, 1200)}` : "",
    "",
    `Traveler said: "${clip(utterance, 300)}"`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Robust parse — markdown fences, preambles, or malformed JSON never throw. */
export function parseConciergeResponse(raw: string): ConciergeResponse | null {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  const clean = jsonStart >= 0 && jsonEnd > jsonStart
    ? raw.slice(jsonStart, jsonEnd + 1)
    : raw.replace(/```json|```/g, "").trim();
  try {
    return ConciergeResponseSchema.parse(JSON.parse(clean));
  } catch {
    return null;
  }
}
