import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { BodySchema, resolveUserIdFast } from "@/lib/decision/analyzeRequestSchema";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  try {
    // Allow anonymous analyze — sign-in is only required to save/activate a trip.
    const userId = (await resolveUserIdFast()) ?? "anonymous";

    const rateLimit = await enforceRateLimit({
      policyName: "ai-suggestions",
      identifier: userId,
      route: "decision-strategies",
      requestId: `decision-strategies-${userId}-${Date.now()}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimit.headers });
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

    if (planMode === "hotels") {
      return NextResponse.json({ brief });
    }

    const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
    const hasOrigin = brief.searchAirports.length > 0;

    if (!arrivalIata || brief.destinationRequired) {
      const clarification = hasOrigin
        ? {
            type: "missing_destination" as const,
            message: `Got it — flying out of ${brief.intent.originCity ?? "your area"} on ${brief.intent.startDate ?? "your travel date"}. Where are you flying to?`,
            hint: "Try: 'New York', 'London Heathrow', 'Bari Italy', or any city or airport code.",
            parsed: {
              origin: brief.intent.originCity,
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

    if (brief.originRequired || !hasOrigin) {
      console.log("[analyze] route:origin-required", { ms: elapsed() });
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
