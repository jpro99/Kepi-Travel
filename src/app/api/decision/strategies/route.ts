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
import type { TopologySearchResult } from "@/lib/decision/topology/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Guarantee a response before Vercel kills the function (60s) and before
// the client timeout (40s). Must respond by 38s.
const ROUTE_DEADLINE_MS = 38_000;

function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(fallback);
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const EMPTY_WAVE: TopologySearchResult = {
  algorithm: "kepi-optimal-search",
  version: 2,
  candidatesGenerated: 0,
  candidatesPriced: 0,
  candidatesPruned: 0,
  dateFlexVariantsPriced: 0,
  duffelCallsUsed: 0,
  seatsAeroCallsUsed: 0,
  seatsAeroConfigured: false,
  hotelEstimateUsd: 0,
  baseline: null,
  winners: [],
  bestSavingsUsd: 0,
  bestSavingsPct: 0,
  routeSummary: "",
  headline: "",
};

const EMPTY_DUFFEL = { configured: false, quotes: [] } as const;

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
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const remaining = () => ROUTE_DEADLINE_MS - elapsed();

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
      return NextResponse.json({ error: "Rate limit exceeded — try again in a minute." }, { status: 429, headers: rateLimit.headers });
    }

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
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
    const fastPath = parsed.data.fastPath === true;

    const brief = buildDecisionBrief(parsed.data.prompt, genome, {
      comfortWeight, planMode, paymentMode,
      enabledLegIds: parsed.data.enabledLegIds,
      expert: parsed.data.expert,
    });

    // Hotels — no flight search needed
    if (planMode === "hotels") {
      return NextResponse.json({ brief });
    }

    // If destination couldn't be parsed, return strategies immediately
    // without Duffel calls — avoids TypeError on undefined.toUpperCase()
    const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
    if (!arrivalIata) {
      console.log("[analyze] no destination parsed — returning strategies without live prices", {
        prompt: parsed.data.prompt.slice(0, 80),
        ms: elapsed(),
      });
      return NextResponse.json({ brief, _meta: { skipped: "no_destination" } });
    }

    let workingBrief = brief;

    // Phase 1: wave search + fused search — hard deadline
    if (!fastPath && !brief.originRequired && brief.searchAirports.length > 0) {
      const phase1Budget = Math.max(2_000, remaining() - 20_000); // leave 20s for phase2
      console.log("[analyze] phase1:start", { ms: elapsed(), phase1Budget, airports: brief.searchAirports, destination: arrivalIata });

      const [topologySearch, fusedFlightSearch] = await Promise.all([
        withDeadline(
          runKepiWaveSearch(brief.intent, genome, brief.searchAirports).catch(() => EMPTY_WAVE),
          phase1Budget,
          EMPTY_WAVE,
        ),
        withDeadline(
          runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId).catch(() => null),
          phase1Budget,
          null,
        ),
      ]);

      console.log("[analyze] phase1:done", {
        ms: elapsed(),
        duffelCalls: topologySearch.duffelCallsUsed,
        fusedCash: fusedFlightSearch?.meta.cashCount ?? 0,
      });

      workingBrief = {
        ...brief,
        topologySearch,
        fusedFlightSearch: fusedFlightSearch ?? undefined,
        strategies: mergeTopologyIntoStrategies(brief.strategies, topologySearch),
        strategyCatalog: mergeTopologyIntoStrategies(brief.strategyCatalog ?? brief.strategies, topologySearch),
      };
      attachTopologyMetadata(workingBrief, topologySearch);
    }

    // Phase 2: Duffel cash quotes — hard deadline
    const homeIata = workingBrief.searchAirports[0];
    const hasReturn = Boolean(workingBrief.intent.returnAirports?.length && homeIata);
    const connectorLegs = enabledConnectorLegs(workingBrief.flightLegs ?? []);
    const phase2Budget = Math.min(7_000, Math.max(5_000, remaining() - 1_000)); // 5-7s for Duffel

    console.log("[analyze] phase2:start", { ms: elapsed(), phase2Budget, arrivalIata, hasReturn, origins: workingBrief.searchAirports });

    const [outboundDuffel, returnDuffel, connectorDuffel] = await Promise.all([
      withDeadline(
        searchDuffelCashQuotes({
          origins: workingBrief.searchAirports,
          destination: arrivalIata,
          departureDate: workingBrief.intent.startDate,
        }).catch(() => EMPTY_DUFFEL),
        phase2Budget,
        EMPTY_DUFFEL,
      ),
      hasReturn && workingBrief.intent.endDate
        ? withDeadline(
            searchDuffelCashQuotes({
              origins: workingBrief.intent.returnAirports as string[],
              destination: homeIata as string,
              departureDate: workingBrief.intent.endDate,
            }).catch(() => EMPTY_DUFFEL),
            phase2Budget,
            EMPTY_DUFFEL,
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
            }).catch(() => EMPTY_DUFFEL),
            phase2Budget,
            EMPTY_DUFFEL,
          ),
        })),
      ),
    ]);

    console.log("[analyze] phase2:done", {
      ms: elapsed(),
      outbound: outboundDuffel.quotes.length,
      configured: outboundDuffel.configured,
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

  } catch (err) {
    // Last-resort catch — should never happen but prevents hanging
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[analyze] unhandled error", { ms: Date.now() - startedAt, error: msg });
    return NextResponse.json(
      { error: "Analysis failed — please try again." },
      { status: 500 }
    );
  }
}
