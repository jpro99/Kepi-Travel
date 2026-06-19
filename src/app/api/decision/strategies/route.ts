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

// Hard deadline: return to client before Vercel kills the function.
// Client timeout is 45s — we must respond by 38s to avoid a race.
const ROUTE_DEADLINE_MS = 38_000;

function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

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
  fastPath: z.boolean().optional(),
});

export async function POST(req: Request) {
  const analyzeStartedAt = Date.now();
  const elapsed = () => Date.now() - analyzeStartedAt;
  const remaining = () => ROUTE_DEADLINE_MS - elapsed();
  console.log("[analyze] route:start", { ts: analyzeStartedAt });

  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-strategies",
    requestId: `decision-strategies-${userId}-${Date.now()}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimit.headers });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
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
    comfortWeight, planMode, paymentMode,
    enabledLegIds: parsed.data.enabledLegIds,
    expert: parsed.data.expert,
  });

  // Hotels — no flight search needed, return immediately
  if (planMode === "hotels") {
    return NextResponse.json({ brief });
  }

  let workingBrief = brief;

  // Phase 1: wave search + fused search in parallel
  // Capped at (deadline - 12s) to leave time for Duffel quotes
  if (!fastPath && !brief.originRequired && brief.searchAirports.length > 0) {
    const phase1Budget = Math.max(5_000, remaining() - 12_000);
    console.log("[analyze] phase1:start", { ms: elapsed(), phase1Budget, airports: brief.searchAirports });

    const emptyWave = { candidates: [], duffelCallsUsed: 0, seatsAeroCallsUsed: 0, pricedRoutes: [] };

    const [topologySearch, fusedFlightSearch] = await Promise.all([
      withDeadline(
        runKepiWaveSearch(brief.intent, genome, brief.searchAirports),
        phase1Budget,
        emptyWave,
      ),
      withDeadline(
        runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId),
        phase1Budget,
        null,
      ),
    ]);

    console.log("[analyze] phase1:done", {
      ms: elapsed(),
      duffelCalls: topologySearch.duffelCallsUsed,
      fusedCash: fusedFlightSearch?.meta.cashCount ?? 0,
      timedOut: topologySearch.duffelCallsUsed === 0,
    });

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

  // Phase 2: Duffel cash quotes — capped at remaining time
  const arrivalIata = workingBrief.intent.stops?.[0]?.iata ?? workingBrief.intent.destinationIata;
  const homeIata = workingBrief.searchAirports[0];
  const hasReturn = Boolean(workingBrief.intent.returnAirports?.length && homeIata);
  const connectorLegs = enabledConnectorLegs(workingBrief.flightLegs ?? []);
  const emptyDuffel = { configured: false, quotes: [] };
  const phase2Budget = Math.max(3_000, remaining() - 1_000);

  console.log("[analyze] phase2:start", { ms: elapsed(), phase2Budget, arrivalIata, hasReturn });

  const [outboundDuffel, returnDuffel, connectorDuffel] = await Promise.all([
    withDeadline(
      searchDuffelCashQuotes({
        origins: workingBrief.searchAirports,
        destination: arrivalIata,
        departureDate: workingBrief.intent.startDate,
      }),
      phase2Budget,
      emptyDuffel,
    ),
    hasReturn
      ? withDeadline(
          searchDuffelCashQuotes({
            origins: workingBrief.intent.returnAirports as string[],
            destination: homeIata as string,
            departureDate: workingBrief.intent.endDate,
          }),
          phase2Budget,
          emptyDuffel,
        )
      : Promise.resolve(undefined),
    Promise.all(
      connectorLegs.map(async (leg) => ({
        legId: leg.id,
        result: await withDeadline(
          searchDuffelCashQuotes({
            origins: [leg.fromIata],
            destination: leg.toIata,
            departureDate: leg.departureDate,
          }),
          phase2Budget,
          emptyDuffel,
        ),
      })),
    ),
  ]);

  console.log("[analyze] phase2:done", {
    ms: elapsed(),
    outbound: outboundDuffel.quotes.length,
    return: returnDuffel?.quotes.length ?? 0,
    live: outboundDuffel.configured,
  });

  const enriched = enrichBriefWithDuffelPricing(
    workingBrief,
    outboundDuffel,
    genome,
    comfortWeight,
    returnDuffel,
    connectorDuffel,
  );

  console.log("[analyze] complete", { ms: elapsed(), strategies: enriched.strategies.length, fastPath });
  return NextResponse.json({ brief: enriched });
}
