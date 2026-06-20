import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// This mirrors EXACTLY what /api/decision/strategies does, step by step
export async function GET(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const prompt = url.searchParams.get("q") ?? "fly from Beaumont CA to New York on September 1st";
  const t0 = Date.now();
  const log: Record<string, unknown>[] = [];
  const mark = (label: string, extra?: Record<string, unknown>) => log.push({ label, ms: Date.now() - t0, ...extra });

  mark("start");
  const genome = await getTravelerGenome(userId);
  mark("genome");

  const brief = buildDecisionBrief(prompt, genome, { planMode: "flights", paymentMode: "cash" });
  const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
  mark("brief", { strategies: brief.strategies.length, airports: brief.searchAirports, dest: arrivalIata, originRequired: brief.originRequired });

  if (!arrivalIata || !brief.searchAirports.length) {
    return NextResponse.json({ log, error: "Cannot parse trip — no destination or origin" });
  }

  // Phase 2: same Duffel calls as strategies route
  const [outboundDuffel] = await Promise.all([
    searchDuffelCashQuotes({ origins: brief.searchAirports, destination: arrivalIata, departureDate: brief.intent.startDate }).catch(() => ({ configured: false, quotes: [] })),
  ]);
  mark("duffel_phase2", { quotes: outboundDuffel.quotes.length, cheapest: outboundDuffel.quotes[0]?.totalAmountUsd });

  // Enrich — synchronous
  const enriched = enrichBriefWithDuffelPricing(brief, outboundDuffel, genome, genome.decisionWeights.comfort);
  mark("enriched", {
    strategies: enriched.strategies.length,
    firstStrategy: enriched.strategies[0] ? {
      id: enriched.strategies[0].id,
      kind: enriched.strategies[0].kind,
      recommended: enriched.strategies[0].recommended,
      segments: enriched.strategies[0].segments.length,
      costUsd: enriched.strategies[0].segments.reduce((s, seg) => s + seg.costUsd, 0),
    } : null,
  });

  mark("complete");

  // Return EXACT same shape as strategies route
  return NextResponse.json({ log, brief: enriched });
}
