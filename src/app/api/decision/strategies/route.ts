import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  comfortWeight: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
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

  const userId = await resolveAuthenticatedUserId();
  const genome = await getTravelerGenome(userId ?? undefined);
  const comfortWeight = parsed.data.comfortWeight ?? genome.decisionWeights.comfort;
  const brief = buildDecisionBrief(parsed.data.prompt, genome, {
    comfortWeight,
  });

  const duffel = await searchDuffelCashQuotes({
    origins: brief.searchAirports,
    destination: brief.intent.destinationIata,
    departureDate: brief.intent.startDate,
  });

  const enriched = enrichBriefWithDuffelPricing(brief, duffel, comfortWeight);

  return NextResponse.json({ brief: enriched });
}
