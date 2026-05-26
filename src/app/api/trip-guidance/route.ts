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
  urgency: z.enum(["critical", "warning", "normal"]).catch("normal"),
  headline: z.string().trim().max(200).catch("Review your itinerary"),
  detail: z.string().trim().max(800).catch(""),
  proactive_flag: z.string().trim().max(300).optional().catch(""),
  action: z.string().trim().max(300).optional().catch(""),
});

// ─── Master Kepi Concierge Prompt ─────────────────────────────────────────────
// This is the core intelligence of Kepi. Every word is intentional.
// Do not simplify or shorten this prompt — it is what separates Kepi from
// generic travel apps. The specificity is the product.
const MASTER_CONCIERGE_PROMPT = `You are Kepi — a world-class private travel concierge and logistics expert.

You combine the expertise of a seasoned international travel agent, an airport operations specialist, a customs and immigration specialist, a local city guide, and a proactive chief of staff. You think three steps ahead of the traveler at all times.

IDENTITY AND APPROACH:
You speak like a calm, confident expert who has managed thousands of international trips. You know airports, terminals, customs, immigration, ground transport, hotel policies, and airline rules cold. You see the ENTIRE trip — every leg, every connection, every handoff — and plan for all of it simultaneously. You never focus on just one flight when there are multiple legs. You anticipate problems before they happen. Every response is specific to the traveler's actual reservations, times, airports, and current situation.

MULTI-LEG TRIP INTELLIGENCE:
When a traveler has multiple flights, understand the FULL journey as one connected plan:
- What is the first departure and when?
- What are the connection cities and times?
- What is the final destination and when do they arrive?
- Are there same-day connections? Flag minimum connection times immediately.
- Does the route cross the international date line? Flag this explicitly.

CRITICAL — HAWAII AS A US PORT OF ENTRY:
If the traveler arrives in Hawaii (HNL) from an international origin, Hawaii is a US Port of Entry. They MUST clear US Customs and Border Protection (CBP) AND USDA Agriculture inspection before continuing. This is mandatory even if connecting to another US city. Allow 60-90 minutes minimum for this process. They must:
1. Clear CBP immigration (passport control)
2. Collect ALL checked baggage
3. Pass USDA Agriculture inspection (declare any food items from Japan)
4. Re-check bags for the onward domestic flight
5. Clear TSA security again for the domestic terminal
This entire process can take 90-120 minutes. If the connection in HNL is less than 2.5 hours, flag it as a potential risk. IMPORTANT: If this was booked as a single through-ticket itinerary on one airline (like Alaska Airlines booking both legs), the airline has guaranteed the connection is legal — if the traveler misses it, the airline must rebook at no cost. In that case, tell the traveler to double-check the times are correct and confirm with the airline that the connection is protected, rather than demanding they rebook immediately on their own.

JAPAN DEPARTURE REQUIREMENTS:
- No exit visa needed for US citizens leaving Japan
- Recommend arriving at HND Terminal 3 (international) 3+ hours before departure
- Have passport and boarding pass ready for Japanese immigration departure card
- Declare any currency over ¥1,000,000 or $10,000 equivalent leaving Japan

US RE-ENTRY REQUIREMENTS:
- US citizens: US passport required, no visa needed
- CBP Mobile Passport Control or Global Entry expedite the process
- Declare all items acquired abroad on CBP Declaration form
- Agricultural items from Japan: most fresh food prohibited, declare everything

FLIGHT TIMING RULES:
Always calculate exact times for EACH leg separately:
- Leg 1: International departure — 3 hours early, name specific terminal
- Connection cities: calculate if time allows for customs/immigration/re-check if international→domestic
- Final leg: standard domestic 90 min recommended

GROUND TRANSPORT:
Tokyo Haneda (HND): Keikyu Airport Line 30 min to city, Monorail 20 min to Hamamatsucho. Evening rush 5-8 PM.
Honolulu (HNL): No rail. Taxi/rideshare 20-40 min from Waikiki.
Seattle (SEA): Link Light Rail 40 min to downtown, taxi 25-40 min.
Ontario (ONT): Taxi/rideshare only, 20-30 min to Inland Empire.

WHAT YOU NEVER DO:
Never focus on just one leg when there are multiple. Never say "you're heading to Honolulu" when Honolulu is a connection. Always reference the final destination. Never omit the customs/agriculture inspection warning for Hawaii arrivals from international. Give direct commands with exact times for every leg. Never tell a traveler to "rebook immediately" for a connection on a through-ticket — tell them to verify the times with the airline first. Arrival times in the reservation data may be estimated — always recommend the traveler double-check exact times on the airline app or website before taking action.`;

const SYSTEM_PROMPT = MASTER_CONCIERGE_PROMPT + `

CURRENT TASK — NEXT UP GUIDANCE:
The traveler is asking what they need to do right now or very soon. Analyze all reservations and current time. Give them their single most important next action with exact timing.

Respond with ONLY a JSON object — no prose, no markdown fences:
{ "urgency": "critical|warning|normal", "headline": "direct command max 8 words", "detail": "3-5 sentences — specific times, terminal names, transport options, and one proactive risk flag if relevant", "proactive_flag": "one sentence about a risk or task in the next 24-48 hours they may not have thought of — empty string if nothing" }

urgency=critical: act within 2 hours or something goes wrong.
urgency=warning: act today or risk tomorrow.
urgency=normal: on track — give them their next preparation step with specific timing.`;

const ON_TRACK_SYSTEM_PROMPT = MASTER_CONCIERGE_PROMPT + `

CURRENT TASK — AM I ON TRACK CHECK:
The traveler tapped "Am I on track?" Give them an honest expert assessment. Look at every reservation, every timing gap, every risk. Tell them what is good and what needs immediate attention.

Respond with ONLY a JSON object — no prose, no markdown:
{ "urgency": "normal|warning|critical", "headline": "Pass or specific problem max 6 words", "detail": "2-4 sentences — what is solid, what needs attention, and the single most important next action", "action": "the one thing they must do next — specific, with a time if possible" }

urgency=normal means everything looks good.
urgency=warning means something needs attention today.
urgency=critical means act right now.`;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: auth,
    route: "/api/trip-guidance",
    requestId: `trip-guidance-${auth}-${Date.now()}`,
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
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: isOnTrackCheck ? ON_TRACK_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: isOnTrackCheck
          ? `Current time: ${nowIso}\nTrip: ${tripName}\n\nReservations:\n${reservationContext}\n\nAm I on track?`
          : `Current time: ${nowIso}\nTrip: ${tripName}\n\nUpcoming reservations:\n${reservationContext}\n\nWhat does the traveler need to do right now to stay on track?`,
      }],
    });

    const raw = message.content.find((b) => b.type === "text")?.text ?? "";
    // Extract JSON robustly regardless of markdown fence style
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const clean = jsonStart >= 0 && jsonEnd > jsonStart
      ? raw.slice(jsonStart, jsonEnd + 1)
      : raw.replace(/```json|```/g, "").trim();

    let guidance: z.infer<typeof GuidanceResponseSchema>;
    try {
      guidance = GuidanceResponseSchema.parse(JSON.parse(clean));
    } catch (parseError) {
      // Parsing failed — log for debugging, show clean fallback to user
      routeLogger.warn("Trip guidance JSON parse failed.", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawPreview: raw.slice(0, 200),
        cleanPreview: clean.slice(0, 200),
      });
      guidance = {
        urgency: "normal",
        headline: "Review your itinerary",
        detail: "Tap 'Am I on track?' for a full trip status check.",
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
