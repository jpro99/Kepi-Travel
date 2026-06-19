import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { enabledConnectorLegs } from "@/lib/decision/flightLegPlanner";
import { mergeTopologyIntoStrategies, attachTopologyMetadata } from "@/lib/decision/topology/toStrategy";
import { runKepiWaveSearch } from "@/lib/decision/topology/waveSearch";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

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
    enabledLegIds: parsed.data.enabledLegIds,
    expert: parsed.data.expert,
  });

  if (planMode === "hotels") {
    return NextResponse.json({ brief });
  }

  let workingBrief = brief;

  if (!brief.originRequired && brief.searchAirports.length > 0) {
    const topologySearch = await runKepiWaveSearch(brief.intent, genome, brief.searchAirports);
    const mergedStrategies = mergeTopologyIntoStrategies(brief.strategies, topologySearch);
    const mergedCatalog = mergeTopologyIntoStrategies(brief.strategyCatalog ?? brief.strategies, topologySearch);
    workingBrief = {
      ...brief,
      topologySearch,
      strategies: mergedStrategies,
      strategyCatalog: mergedCatalog,
    };
    attachTopologyMetadata(workingBrief, topologySearch);
  }

  const arrivalIata = workingBrief.intent.stops?.[0]?.iata ?? workingBrief.intent.destinationIata;
  const outboundDuffel = await searchDuffelCashQuotes({
    origins: workingBrief.searchAirports,
    destination: arrivalIata,
    departureDate: workingBrief.intent.startDate,
  });

  let returnDuffel: Awaited<ReturnType<typeof searchDuffelCashQuotes>> | undefined;
  const homeIata = workingBrief.searchAirports[0];
  if (workingBrief.intent.returnAirports?.length && homeIata) {
    returnDuffel = await searchDuffelCashQuotes({
      origins: workingBrief.intent.returnAirports,
      destination: homeIata,
      departureDate: workingBrief.intent.endDate,
    });
  }

  const connectorLegs = enabledConnectorLegs(workingBrief.flightLegs ?? []);
  const connectorDuffel = await Promise.all(
    connectorLegs.map(async (leg) => ({
      legId: leg.id,
      result: await searchDuffelCashQuotes({
        origins: [leg.fromIata],
        destination: leg.toIata,
        departureDate: leg.departureDate,
      }),
    })),
  );

  const enriched = enrichBriefWithDuffelPricing(
    workingBrief,
    outboundDuffel,
    genome,
    comfortWeight,
    returnDuffel,
    connectorDuffel,
  );

  return NextResponse.json({ brief: enriched });
}
