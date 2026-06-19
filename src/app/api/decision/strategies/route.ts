import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { enabledConnectorLegs } from "@/lib/decision/flightLegPlanner";
import { mergeTopologyIntoStrategies, attachTopologyMetadata } from "@/lib/decision/topology/toStrategy";
import { runKepiWaveSearch } from "@/lib/decision/topology/waveSearch";
import { runFusedSearchForTrip } from "@/lib/flights/fusedFlightSearch";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
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
  /** Skip Optimal Search + fused awards — used once after a full-path timeout. */
  fastPath: z.boolean().optional(),
});

export async function POST(req: Request) {
  const analyzeStartedAt = Date.now();
  console.log("[analyze] route:start", { ts: analyzeStartedAt });

  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    console.log("[analyze] route:abort", { reason: "unauthorized", ms: Date.now() - analyzeStartedAt });
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
  const fastPath = parsed.data.fastPath === true;
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

  if (!fastPath && !brief.originRequired && brief.searchAirports.length > 0) {
    console.log("[analyze] route:parallel-search:start", {
      ms: Date.now() - analyzeStartedAt,
      planMode,
      searchAirports: brief.searchAirports,
    });
    const [topologySearch, fusedFlightSearch] = await Promise.all([
      runKepiWaveSearch(brief.intent, genome, brief.searchAirports),
      planMode !== "hotels" ? runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId) : null,
    ]);
    console.log("[analyze] route:parallel-search:done", {
      ms: Date.now() - analyzeStartedAt,
      duffelCallsUsed: topologySearch.duffelCallsUsed,
      seatsAeroCallsUsed: topologySearch.seatsAeroCallsUsed,
      fusedMeta: fusedFlightSearch?.meta,
      fusedCash: fusedFlightSearch?.meta.cashCount ?? 0,
    });

    if (fusedFlightSearch) {
      console.log("[trip-planner-fused-search]", {
        meta: fusedFlightSearch.meta,
        headline: fusedFlightSearch.headline,
        topScore: fusedFlightSearch.offers[0]?.score,
      });
    }

    const mergedStrategies = mergeTopologyIntoStrategies(brief.strategies, topologySearch);
    const mergedCatalog = mergeTopologyIntoStrategies(brief.strategyCatalog ?? brief.strategies, topologySearch);
    workingBrief = {
      ...brief,
      topologySearch,
      fusedFlightSearch: fusedFlightSearch ?? undefined,
      strategies: mergedStrategies,
      strategyCatalog: mergedCatalog,
    };
    attachTopologyMetadata(workingBrief, topologySearch);
  }

  const arrivalIata = workingBrief.intent.stops?.[0]?.iata ?? workingBrief.intent.destinationIata;
  const homeIata = workingBrief.searchAirports[0];
  const hasReturn = Boolean(workingBrief.intent.returnAirports?.length && homeIata);
  const connectorLegs = enabledConnectorLegs(workingBrief.flightLegs ?? []);

  console.log("[analyze] route:duffel:start", {
    ms: Date.now() - analyzeStartedAt,
    arrivalIata,
    hasReturn,
    connectorCount: connectorLegs.length,
  });

  const [outboundDuffel, returnDuffel, connectorDuffel] = await Promise.all([
    searchDuffelCashQuotes({
      origins: workingBrief.searchAirports,
      destination: arrivalIata,
      departureDate: workingBrief.intent.startDate,
    }),
    hasReturn
      ? searchDuffelCashQuotes({
          origins: workingBrief.intent.returnAirports as string[],
          destination: homeIata as string,
          departureDate: workingBrief.intent.endDate,
        })
      : Promise.resolve(undefined),
    Promise.all(
      connectorLegs.map(async (leg) => ({
        legId: leg.id,
        result: await searchDuffelCashQuotes({
          origins: [leg.fromIata],
          destination: leg.toIata,
          departureDate: leg.departureDate,
        }),
      })),
    ),
  ]);

  console.log("[analyze] route:duffel:done", {
    ms: Date.now() - analyzeStartedAt,
    outboundQuotes: outboundDuffel.quotes.length,
    returnQuotes: returnDuffel?.quotes.length ?? 0,
    connectorCount: connectorDuffel.length,
  });

  const enriched = enrichBriefWithDuffelPricing(
    workingBrief,
    outboundDuffel,
    genome,
    comfortWeight,
    returnDuffel,
    connectorDuffel,
  );

  console.log("[analyze] route:complete", {
    ms: Date.now() - analyzeStartedAt,
    strategyCount: enriched.strategies.length,
    fastPath,
  });

  return NextResponse.json({ brief: enriched });
}
