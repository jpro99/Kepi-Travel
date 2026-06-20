import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const ExpertSchema = z
  .object({
    enabled: z.boolean().optional(),
    originIata: z.string().trim().length(3).optional(),
    cppFloor: z.number().min(0).max(10).optional(),
    dateFlexDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).optional(),
    pointsProgram: z.string().trim().max(80).optional(),
    legDateOverrides: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  })
  .optional();

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  comfortWeight: z.number().min(0).max(1).optional(),
  planMode: z.enum(["flights", "hotels", "full"]).optional(),
  paymentMode: z.enum(["cash", "points", "mix"]).optional(),
  enabledLegIds: z.array(z.string()).optional(),
  expert: ExpertSchema,
  // Kept for client compatibility. Analyze now always returns the fast brief.
  fastPath: z.boolean().optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to use the Command Deck." }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      policyName: "ai-suggestions",
      identifier: userId,
      route: "decision-strategies",
      requestId: `decision-strategies-${userId}-${Date.now()}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded — try again in a minute." },
        { status: 429, headers: rateLimit.headers },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request — please try again." }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request parameters." }, { status: 400 });
    }

    const genome = await getTravelerGenome(userId);
    const comfortWeight = parsed.data.comfortWeight ?? genome.decisionWeights.comfort;
    const planMode = parsed.data.planMode ?? "flights";
    const paymentMode = parsed.data.paymentMode ?? "cash";
    const brief = buildDecisionBrief(parsed.data.prompt, genome, {
      comfortWeight,
      planMode,
      paymentMode,
      enabledLegIds: parsed.data.enabledLegIds,
      expert: parsed.data.expert,
    });

    const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
    const hasOrigin = brief.searchAirports.length > 0;

    if (planMode !== "hotels" && !arrivalIata) {
      const clarification = hasOrigin
        ? {
            type: "missing_destination" as const,
            message: `Got it — flying out of ${brief.originCity ?? "your area"} on ${brief.intent.startDate ?? "your travel date"}. Where are you flying to?`,
            hint: "Try: 'New York', 'London Heathrow', 'Bari Italy', or any city or airport code.",
            parsed: {
              origin: brief.originCity,
              airports: brief.searchAirports,
              startDate: brief.intent.startDate,
            },
          }
        : {
            type: "missing_both" as const,
            message: "Where are you flying from and to? Add your home city or airport and your destination.",
            hint: "Try: 'Fly from Los Angeles to New York on October 5th'",
            parsed: {},
          };
      return NextResponse.json({ brief, clarification });
    }

    if (planMode !== "hotels" && (brief.originRequired || !hasOrigin)) {
      return NextResponse.json({
        brief,
        clarification: {
          type: "missing_origin" as const,
          message: `Flying to ${brief.intent.destinationIata ?? "your destination"} — where are you flying from?`,
          hint: "Add your home city or airport: 'from Los Angeles', 'from LAX', 'from Chicago'",
          parsed: { destination: brief.intent.destinationIata, startDate: brief.intent.startDate },
        },
      });
    }

    console.log("[analyze] fast-brief:complete", {
      ms: elapsed(),
      planMode,
      strategyCount: brief.strategies.length,
    });

    return NextResponse.json({ brief });
  } catch (error) {
    console.error("[analyze] fast-brief:error", {
      ms: elapsed(),
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Analysis failed — please try again." }, { status: 500 });
  }
}
