import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  comfortWeight: z.number().min(0).max(1).optional(),
  planMode: z.enum(["flights", "hotels", "full"]).optional(),
  paymentMode: z.enum(["cash", "points", "mix"]).optional(),
});

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-strategies",
    requestId: `${"decision-strategies"}-${userId}-${Date.now()}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimit.headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const genome = await getTravelerGenome(userId);
  const comfortWeight = parsed.data.comfortWeight ?? genome.decisionWeights.comfort;
  const planMode = parsed.data.planMode ?? "flights";
  const paymentMode = parsed.data.paymentMode ?? "cash";
  const brief = buildDecisionBrief(parsed.data.prompt, genome, {
    comfortWeight,
    planMode,
    paymentMode,
  });

  const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
  const outboundDuffel = await searchDuffelCashQuotes({
    origins: brief.searchAirports,
    destination: arrivalIata,
    departureDate: brief.intent.startDate,
  });

  let returnDuffel: Awaited<ReturnType<typeof searchDuffelCashQuotes>> | undefined;
  const homeIata = brief.searchAirports[0];
  if (brief.intent.returnAirports?.length && homeIata) {
    returnDuffel = await searchDuffelCashQuotes({
      origins: brief.intent.returnAirports,
      destination: homeIata,
      departureDate: brief.intent.endDate,
    });
  }

  const enriched = enrichBriefWithDuffelPricing(
    brief,
    outboundDuffel,
    genome,
    comfortWeight,
    returnDuffel,
  );

  return NextResponse.json({ brief: enriched });
}
