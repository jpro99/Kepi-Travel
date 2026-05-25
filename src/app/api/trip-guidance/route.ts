import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routeLogger = logger.withContext({ route: "/api/trip-guidance" });

const RequestSchema = z.object({
  tripName: z.string().trim().max(200).default("My Trip"),
  nowIso: z.string().trim().max(40),
  reservationContext: z.string().trim().max(4000),
  mode: z.enum(["guidance", "on-track-check"]).default("guidance"),
});

const GuidanceResponseSchema = z.object({
  urgency: z.enum(["critical", "warning", "normal"]).default("normal"),
  headline: z.string().trim().max(120),
  detail: z.string().trim().max(400),
});

const ON_TRACK_SYSTEM_PROMPT = [
  "You are a travel execution assistant for the Kepi app.",
  "The user tapped 'Am I on track?' — give them a fast, honest pass/fail assessment.",
  "Look at all upcoming reservations and current time. Identify if there is ANYTHING they need to act on right now.",
  "Respond with ONLY a JSON object — no prose, no markdown:",
  '{ "urgency": "normal|warning|critical", "headline": "Pass or Fail summary max 6 words", "detail": "2-3 sentences — what is good, what needs attention right now", "action": "single most important next step if any" }',
  "urgency=normal means all good, warning means something needs attention today, critical means act immediately.",
  "Be direct and specific. No generic advice.",
].join(" ");

const SYSTEM_PROMPT = [
  "You are a precision travel execution assistant for the Kepi app.",
  "Your ONLY job: tell the traveler exactly what they need to do RIGHT NOW or very soon to stay on track.",
  "Be specific with real times and practical steps.",
  "FLIGHT RULES: Always add 3 hours buffer for international flights, 2 hours for domestic.",
  "Calculate departure time from hotel/current location to airport based on typical travel time.",
  "Tell them which terminal — international departures are always a different terminal than domestic.",
  "If the flight is international, say 'Head to the International Departures terminal'.",
  "HOTEL RULES: If there is a hotel checkout before a flight on the same day, remind them to check out first and factor that into their departure time.",
  "TIME RULES: Use the actual flight departure time from the reservation data, not localTime if flightDepartureTime is provided.",
  "DIRECTIONS: Give one clear actionable step toward the airport — e.g. 'Take the airport express train' or 'Allow 45 min by taxi in morning traffic'.",
  "Respond with ONLY a JSON object — no prose, no markdown fences:",
  '{ "urgency": "critical|warning|normal", "headline": "short action max 8 words", "detail": "3-4 sentences of specific actionable guidance including checkout time, departure time from hotel, terminal, and transport tip" }',
  "urgency=critical if <4 hours to next event, warning if <24 hours, normal if days away.",
  "Never say I or You should. Use direct commands like: Check out by 11 AM. Leave hotel by 5:30 PM.",
  "If trip is days away, give specific prep tip like 'Complete online check-in 24 hrs before departure' with the actual date/time.",
].join(" ");

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(auth, {
    policyName: "trip-guidance",
    maxPerWindow: 30,
    windowSeconds: 3600,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimit.headers });
  }

  let body: unknown;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
    body = rawBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tripName, nowIso, reservationContext } = parsed.data;

  routeLogger.info("Trip guidance request.", { userId: auth, nowIso });

  const client = new Anthropic();

  try {
    const isOnTrackCheck = parsed.data.mode === "on-track-check";
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: isOnTrackCheck ? ON_TRACK_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: isOnTrackCheck
          ? `Current time: ${nowIso}\nTrip: ${tripName}\n\nReservations:\n${reservationContext}\n\nAm I on track?`
          : `Current time: ${nowIso}\nTrip: ${tripName}\n\nUpcoming reservations:\n${reservationContext}\n\nWhat does the traveler need to do right now to stay on track?`,
      }],
    });

    const raw = message.content.find((b) => b.type === "text")?.text ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();

    let guidance: z.infer<typeof GuidanceResponseSchema>;
    try {
      guidance = GuidanceResponseSchema.parse(JSON.parse(clean));
    } catch {
      guidance = {
        urgency: "normal",
        headline: "Check your itinerary",
        detail: raw.slice(0, 300),
      };
    }

    routeLogger.info("Trip guidance response.", { userId: auth, urgency: guidance.urgency });
    return NextResponse.json(guidance, { headers: rateLimit.headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    routeLogger.warn("Trip guidance failed.", { userId: auth, error: msg });
    return NextResponse.json({ error: `Guidance unavailable: ${msg}` }, { status: 502 });
  }
}
