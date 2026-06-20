import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const prompt = url.searchParams.get("q") ?? "fly from Beaumont CA to New York on September 1st";
  const t0 = Date.now();
  const log: Record<string, unknown>[] = [];
  const mark = (label: string, extra?: Record<string, unknown>) => {
    log.push({ label, ms: Date.now() - t0, ...extra });
  };

  mark("start");

  // Step 1: genome
  const genome = await getTravelerGenome(userId);
  mark("genome_loaded");

  // Step 2: build brief
  const brief = buildDecisionBrief(prompt, genome, { planMode: "flights", paymentMode: "cash" });
  mark("brief_built", {
    strategies: brief.strategies.length,
    searchAirports: brief.searchAirports,
    destination: brief.intent.destinationIata,
    originRequired: brief.originRequired,
    startDate: brief.intent.startDate,
  });

  if (brief.originRequired || !brief.searchAirports.length) {
    return NextResponse.json({ log, error: "No origin parsed from prompt" });
  }

  const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
  if (!arrivalIata) {
    return NextResponse.json({ log, error: "No destination parsed from prompt" });
  }

  // Step 3: single Duffel call (top airport only)
  mark("duffel_start", { origin: brief.searchAirports[0], destination: arrivalIata });
  try {
    const { searchDuffelCashQuotes } = await import("@/lib/providers/duffel/flightOffers");
    const result = await searchDuffelCashQuotes({
      origins: [brief.searchAirports[0]!],
      destination: arrivalIata,
      departureDate: brief.intent.startDate,
    });
    mark("duffel_done", { configured: result.configured, quotes: result.quotes.length, cheapest: result.quotes[0]?.totalAmountUsd });
  } catch (err) {
    mark("duffel_error", { error: err instanceof Error ? err.message : String(err) });
  }

  // Step 4: wave search (capped at 10s)
  mark("wave_start");
  try {
    const { runKepiWaveSearch } = await import("@/lib/decision/topology/waveSearch");
    const wave = await Promise.race([
      runKepiWaveSearch(brief.intent, genome, brief.searchAirports),
      new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
    ]);
    mark("wave_done", {
      timedOut: wave === null,
      duffelCalls: wave?.duffelCallsUsed ?? "timed out",
      winners: wave?.winners.length ?? 0,
    });
  } catch (err) {
    mark("wave_error", { error: err instanceof Error ? err.message : String(err) });
  }

  // Step 5: fused search (capped at 8s)
  mark("fused_start");
  try {
    const { runFusedSearchForTrip } = await import("@/lib/flights/fusedFlightSearch");
    const fused = await Promise.race([
      runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId),
      new Promise<null>((r) => setTimeout(() => r(null), 8_000)),
    ]);
    mark("fused_done", {
      timedOut: fused === null,
      cashCount: fused?.meta.cashCount ?? "timed out",
    });
  } catch (err) {
    mark("fused_error", { error: err instanceof Error ? err.message : String(err) });
  }

  mark("complete");
  return NextResponse.json({ log, prompt });
}
