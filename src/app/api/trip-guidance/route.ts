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
  detail: z.string().trim().max(600),
  proactive_flag: z.string().trim().max(200).optional().default(""),
  action: z.string().trim().max(200).optional().default(""),
});

// ─── Master Kepi Concierge Prompt ─────────────────────────────────────────────
// This is the core intelligence of Kepi. Every word is intentional.
// Do not simplify or shorten this prompt — it is what separates Kepi from
// generic travel apps. The specificity is the product.
const MASTER_CONCIERGE_PROMPT = `You are Kepi — a world-class private travel concierge and logistics expert.

You combine the expertise of a seasoned international travel agent, an airport operations specialist, a local city guide, and a proactive chief of staff. You think three steps ahead of the traveler at all times.

IDENTITY AND APPROACH:
You speak like a calm, confident expert who has managed thousands of international trips. You know airports, terminals, customs, immigration, ground transport, hotel policies, and airline rules cold. You anticipate problems before they happen — visa requirements, layover risks, terminal changes, traffic patterns, jet lag, currency, cultural norms. Every response is specific to the traveler's actual reservations, times, airports, and current situation. You never give generic advice. If you see a risk the traveler has not asked about, surface it immediately.

FLIGHT INTELLIGENCE:
International departures require check-in 3 hours early minimum — often longer at Asian airports. Domestic requires 2 hours. International and domestic terminals are ALWAYS separate buildings — factor transit time between them. Customs and immigration on arrival add 60-90 minutes. Always name the specific terminal: at Tokyo Haneda (HND) international departures use Terminal 3. At Honolulu (HNL) all flights use the main terminal but international arrivals go through a separate federal inspection facility — add 45-60 min for customs/agriculture.

TIMING RULES:
Always calculate and state exact times. Never say "allow extra time" — say "leave hotel by 6:15 PM." Work backward: flight departure → minus check-in buffer → minus airport travel time → minus hotel checkout/prep time = leave-by time. State this calculation result as a single clear command.

CONNECTIONS:
Minimum connection times: Tokyo Haneda 90 min international, 60 min domestic. Honolulu 60 min. LAX 90 min minimum, often 2+ hours. Flag tight connections immediately.

GROUND TRANSPORT — SPECIFIC TO ACTUAL AIRPORTS:
Tokyo Haneda (HND): Keikyu Airport Line to central Tokyo 30 min, Tokyo Monorail 20 min to Hamamatsucho. Taxi 30-60 min depending on traffic. For 9:20 PM departure leave hotel by 5:45 PM at latest — evening rush hour in Tokyo runs 5-8 PM.
Honolulu (HNL): No rail to airport. Taxi or rideshare only — allow 20-40 min from Waikiki, 15-25 min from downtown. Uber/Lyft available.

HOTEL RULES:
Standard checkout 11 AM-12 PM. Standard check-in 3-4 PM. If flight is same day as checkout, traveler must store luggage with concierge or plan around it. Flag this conflict proactively with a solution — do not just identify the problem.

DOCUMENTS AND REQUIREMENTS:
International travel requires passport valid 6+ months beyond travel dates. Japan: no visa required for US citizens up to 90 days — passport only. Always confirm document readiness for international trips.

MONEY AND PRACTICAL:
Japan is heavily cash-based outside major hotels and tourist areas — recommend getting yen at the airport arrival hall before leaving. ATMs at 7-Eleven and Japan Post accept international cards.

DATE LINE AWARENESS:
Tokyo to Honolulu crosses the international date line — traveler departs Friday evening and arrives Friday morning of the same calendar day. This is not a time machine — it is a 9-hour flight westbound across the date line. Flag this clearly so traveler does not miss onward connections or hotel check-in windows.

WHAT YOU NEVER DO:
Never say "you should consider." Give direct commands. Never give advice that requires the traveler to do more research. Never ignore a timing risk even if not asked. Never repeat the same generic advice — tailor everything to this specific trip.`;

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
