import { NextResponse } from "next/server";
import { BodySchema, resolveUserIdFast } from "@/lib/decision/analyzeRequestSchema";
import { enrichBriefWithDuffelPricing, mergeFusedIntoBrief } from "@/lib/decision/livePricing";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { enabledConnectorLegs } from "@/lib/decision/flightLegPlanner";
import { mergeTopologyIntoStrategies, attachTopologyMetadata } from "@/lib/decision/topology/toStrategy";
import { runKepiWaveSearch } from "@/lib/decision/topology/waveSearch";
import { runFusedSearchForTrip, cabinFromGenome } from "@/lib/flights/fusedFlightSearch";
import { saveSearchSnapshot } from "@/lib/flights/searchSnapshotCache";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const maxDuration = 60;
// /api/decision/strategies must stay fast (<1.5s, no live providers — see its route.test.ts).
// This is the second, slower stage: topology + fused cash/award search + live Duffel pricing.
// Client calls it after rendering the fast brief; it's allowed to take real time, but still
// capped so a Seats.aero/Duffel hang can't take the whole request down with it.
const ENRICHMENT_TIMEOUT_MS = 15_000;

interface EnrichmentResult {
  topologySearch: Awaited<ReturnType<typeof runKepiWaveSearch>> | null;
  fusedFlightSearchResult: Awaited<ReturnType<typeof runFusedSearchForTrip>>;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  try {
    const userId = (await resolveUserIdFast()) ?? "anonymous";

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

    if (planMode === "hotels" || brief.originRequired || brief.destinationRequired || brief.searchAirports.length === 0) {
      return NextResponse.json({ brief });
    }

    let workingBrief = brief;
    let fusedFlightSearchResult: Awaited<ReturnType<typeof runFusedSearchForTrip>> = null;

    console.log("[enrich] route:parallel-search:start", { ms: elapsed(), planMode, searchAirports: brief.searchAirports });

    const enrichment = await Promise.race([
      (async (): Promise<EnrichmentResult> => {
        const [topologySearch, fusedFlightSearch] = await Promise.all([
          runKepiWaveSearch(brief.intent, genome, brief.searchAirports),
          runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId),
        ]);
        return { topologySearch, fusedFlightSearchResult: fusedFlightSearch };
      })(),
      new Promise<EnrichmentResult>((resolve) =>
        setTimeout(() => resolve({ topologySearch: null, fusedFlightSearchResult: null }), ENRICHMENT_TIMEOUT_MS),
      ),
    ]);

    const { topologySearch, fusedFlightSearchResult: fusedFlightSearch } = enrichment;
    fusedFlightSearchResult = fusedFlightSearch;

    if (planMode === "flights" && fusedFlightSearch) {
      void saveSearchSnapshot(userId, {
        prompt: parsed.data.prompt,
        destination: fusedFlightSearch.params.destination,
        departDate: fusedFlightSearch.params.departDate,
        returnDate: fusedFlightSearch.params.returnDate,
        cabin: fusedFlightSearch.params.cabin,
        originCashLeaderboard: fusedFlightSearch.originCashLeaderboard ?? [],
        originAwardLeaderboard: fusedFlightSearch.originAwardLeaderboard ?? [],
        alaskaUpgradeCandidates: fusedFlightSearch.alaskaUpgradeCandidates,
        headline: fusedFlightSearch.headline,
      }).catch(() => {});
    }

    console.log("[enrich] route:parallel-search:done", {
      ms: elapsed(),
      duffelCallsUsed: topologySearch?.duffelCallsUsed,
      seatsAeroCallsUsed: topologySearch?.seatsAeroCallsUsed,
      fusedMeta: fusedFlightSearch?.meta,
      fusedCash: fusedFlightSearch?.meta.cashCount ?? 0,
      enrichmentTimedOut: topologySearch === null && fusedFlightSearch === null,
    });

    if (topologySearch) {
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
    } else if (fusedFlightSearch) {
      workingBrief = { ...brief, fusedFlightSearch };
    }

    const arrivalIataForPricing = workingBrief.intent.stops?.[0]?.iata ?? workingBrief.intent.destinationIata;
    const homeIata = workingBrief.searchAirports[0];
    const hasReturn = Boolean(workingBrief.intent.returnAirports?.length && homeIata);
    const connectorLegs = enabledConnectorLegs(workingBrief.flightLegs ?? []);
    const searchCabin = cabinFromGenome(genome);

    console.log("[enrich] route:duffel:start", {
      ms: elapsed(),
      arrivalIataForPricing,
      hasReturn,
      connectorCount: connectorLegs.length,
    });

    const [outboundDuffel, returnDuffel, connectorDuffel] = await Promise.all([
      searchDuffelCashQuotes({
        origins: workingBrief.searchAirports,
        destination: arrivalIataForPricing,
        departureDate: workingBrief.intent.startDate,
        cabinClass: searchCabin,
      }),
      hasReturn
        ? searchDuffelCashQuotes({
            origins: workingBrief.intent.returnAirports as string[],
            destination: homeIata as string,
            departureDate: workingBrief.intent.endDate,
            cabinClass: searchCabin,
          })
        : Promise.resolve(undefined),
      Promise.all(
        connectorLegs.map(async (leg) => ({
          legId: leg.id,
          result: await searchDuffelCashQuotes({
            origins: [leg.fromIata],
            destination: leg.toIata,
            departureDate: leg.departureDate,
            cabinClass: searchCabin,
          }),
        })),
      ),
    ]);

    console.log("[enrich] route:duffel:done", {
      ms: elapsed(),
      outboundQuotes: outboundDuffel.quotes.length,
      returnQuotes: returnDuffel?.quotes.length ?? 0,
      connectorCount: connectorDuffel.length,
    });

    let enriched = enrichBriefWithDuffelPricing(
      workingBrief,
      outboundDuffel,
      genome,
      comfortWeight,
      returnDuffel,
      connectorDuffel,
    );

    if (fusedFlightSearchResult) {
      enriched = mergeFusedIntoBrief(enriched, fusedFlightSearchResult, genome, comfortWeight);
    }

    console.log("[enrich] route:complete", { ms: elapsed(), strategyCount: enriched.strategies.length });

    return NextResponse.json({ brief: enriched });
  } catch (error) {
    console.error("[enrich] route:error", { ms: elapsed(), error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Live pricing failed — showing modeled estimates." }, { status: 500 });
  }
}
