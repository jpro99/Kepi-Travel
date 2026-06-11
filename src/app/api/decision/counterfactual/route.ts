import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { buildCounterfactual, buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  mutation: z.object({
    dateShiftDays: z.number().int().min(-30).max(30).optional(),
    priorityComfort: z.number().min(0).max(1).optional(),
    willingToReposition: z.boolean().optional(),
  }),
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
  const result = buildCounterfactual(parsed.data.prompt, genome, parsed.data.mutation);
  const comfortWeight =
    parsed.data.mutation.priorityComfort ?? genome.decisionWeights.comfort;
  const brief = buildDecisionBrief(parsed.data.prompt, genome, { mutation: parsed.data.mutation });

  const duffel = await searchDuffelCashQuotes({
    origins: brief.searchAirports,
    destination: brief.intent.destinationIata,
    departureDate: brief.intent.startDate,
  });

  const enriched = enrichBriefWithDuffelPricing(brief, duffel, comfortWeight);

  return NextResponse.json({ counterfactual: result, brief: enriched });
}
