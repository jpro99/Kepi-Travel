import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import {
  AIRPORT_NAV_SYSTEM_PROMPT,
  buildAirportNavUserMessage,
  parseConciergeResponse,
  type AirportNavContext,
} from "@/lib/airportNav/voiceConcierge";
import { getAirportLayout } from "@/lib/airportNav/getLayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routeLogger = logger.withContext({ route: "/api/airport-nav/voice-intent" });

const RequestSchema = z.object({
  utterance: z.string().trim().min(1).max(400),
  iata: z.string().trim().length(3),
  journeyPhase: z.string().trim().max(30),
  throughSecurity: z.boolean().default(false),
  gateCode: z.string().trim().max(6).nullable().default(null),
  minutesToDeparture: z.number().min(-600).max(100_000),
  pressureLine: z.string().trim().max(200).default(""),
  pressureBreakdown: z.string().trim().max(400).default(""),
  pressureVerdict: z.string().trim().max(20).default("unknown"),
  walkToGateMinutes: z.number().min(0).max(600).nullable().default(null),
  credentials: z.object({
    tsaPreCheck: z.boolean(),
    clear: z.boolean(),
    known: z.boolean(),
  }),
  eligibleLounges: z.array(z.string().trim().max(80)).max(10).default([]),
});

const FALLBACK_SPOKEN =
  "I didn't catch that one — I can take you to your gate, a lounge, security, or tell you if you have time for a stop.";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: auth,
    route: "/api/airport-nav/voice-intent",
    requestId: `airport-voice-${auth}-${Date.now()}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimit.headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data = parsed.data;
  const iata = data.iata.toUpperCase();
  const layout = getAirportLayout(iata);
  const nav = getAirportNav(iata);

  const context: AirportNavContext = {
    iata,
    airportName: layout?.name ?? iata,
    journeyPhase: data.journeyPhase,
    throughSecurity: data.throughSecurity,
    gateCode: data.gateCode,
    minutesToDeparture: data.minutesToDeparture,
    pressureLine: data.pressureLine,
    pressureBreakdown: data.pressureBreakdown,
    pressureVerdict: data.pressureVerdict,
    walkToGateMinutes: data.walkToGateMinutes,
    credentials: data.credentials,
    eligibleLounges: data.eligibleLounges,
    nearbyPois: (layout?.pois ?? []).map((poi) => poi.name).slice(0, 25),
    airportNotes: nav ? JSON.stringify(nav).slice(0, 1500) : "",
  };

  routeLogger.info("Airport voice fall-through.", { userId: auth, iata, phase: data.journeyPhase });

  const client = new Anthropic();
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: AIRPORT_NAV_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAirportNavUserMessage(data.utterance, context) }],
    });
    const raw = message.content.find((block) => block.type === "text")?.text ?? "";
    const concierge = parseConciergeResponse(raw);
    if (!concierge) {
      routeLogger.warn("Concierge JSON parse failed.", { userId: auth, rawPreview: raw.slice(0, 160) });
      return NextResponse.json({ spoken: FALLBACK_SPOKEN, action: "none" });
    }
    routeLogger.info("Concierge response.", { userId: auth, action: concierge.action });
    return NextResponse.json(concierge);
  } catch (error) {
    routeLogger.error("Concierge call failed.", {
      userId: auth,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ spoken: FALLBACK_SPOKEN, action: "none" });
  }
}
