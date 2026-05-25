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
});

const GuidanceResponseSchema = z.object({
  urgency: z.enum(["critical", "warning", "normal"]).default("normal"),
  headline: z.string().trim().max(120),
  detail: z.string().trim().max(400),
});

const SYSTEM_PROMPT = [
  "You are a precision travel execution assistant for the Kepi app.",
  "Your ONLY job: tell the traveler exactly what they need to do RIGHT NOW or very soon to stay on track.",
  "Be specific with times. Always include buffer (2 hrs domestic, 3 hrs international flights).",
  "For hotel→flight: calculate departure time from hotel based on travel time to airport.",
  "Respond with ONLY a JSON object — no prose, no markdown fences:",
  '{ "urgency": "critical|warning|normal", "headline": "short action max 8 words", "detail": "2-3 sentences of specific actionable guidance" }',
  "urgency=critical if <4 hours to next event, warning if <24 hours, normal if days away.",
  "Never start with I or You should. Give direct commands. Example: Leave hotel by 7:45 AM.",
  "If days away give a useful specific prep tip like confirming hotel check-in time or online check-in.",
].join(" ");

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(auth.userId, {
    policyName: "trip-guidance",
    maxPerWindow: 30,
    windowSeconds: 3600,
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

  const { tripName, nowIso, reservationContext } = parsed.data;

  routeLogger.info("Trip guidance request.", { userId: auth.userId, nowIso });

  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Current time: ${nowIso}\nTrip: ${tripName}\n\nUpcoming reservations:\n${reservationContext}\n\nWhat does the traveler need to do right now to stay on track?`,
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

    routeLogger.info("Trip guidance response.", { userId: auth.userId, urgency: guidance.urgency });
    return NextResponse.json(guidance, { headers: rateLimit.headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    routeLogger.warn("Trip guidance failed.", { userId: auth.userId, error: msg });
    return NextResponse.json({ error: `Guidance unavailable: ${msg}` }, { status: 502 });
  }
}
