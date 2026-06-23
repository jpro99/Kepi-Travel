import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildStrategyFlexOptions } from "@/lib/decision/flexOptions";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import type { TravelStrategy } from "@/lib/decision/types";
import { cabinFromGenome } from "@/lib/flights/fusedFlightSearch";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    strategyId: z.string().trim().min(1).max(80).optional(),
    /** Airport-row click from the 3-column comparison table — origin-scoped instead of strategy-scoped. */
    originIata: z.string().trim().length(3).optional(),
    baselineCashUsd: z.number().nonnegative().optional(),
    comfortWeight: z.number().min(0).max(1).optional(),
    dateFlexDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).optional(),
  })
  .refine((body) => Boolean(body.strategyId) !== Boolean(body.originIata), {
    message: "Provide exactly one of strategyId or originIata",
  });

/** Minimal stub satisfying buildDirectCashOptions's reads (segments, scores.trueOutOfPocket) — */
/** an origin-row click has no real TravelStrategy behind it, only a clicked airport + baseline price. */
function buildOriginFlexStub(originIata: string, baselineCashUsd: number): TravelStrategy {
  return {
    id: `origin-flex-${originIata}`,
    kind: "direct_cash",
    title: `${originIata} direct`,
    headline: `${originIata} direct cash`,
    reasoning: "",
    segments: [],
    scores: {
      tvs: 0,
      trueOutOfPocket: baselineCashUsd,
      frictionMinutes: 0,
      comfortScore: 0,
      valueScore: 0,
      statusScore: 0,
      confidence: 0,
    },
    instrumentsUsed: [],
    preCrimeWarnings: [],
    departureAirports: [originIata],
    recommended: false,
  };
}

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-flex-options",
    requestId: `decision-flex-options-${userId}-${Date.now()}`,
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
  const { originIata } = parsed.data;

  const brief = buildDecisionBrief(parsed.data.prompt, genome, {
    comfortWeight,
    expert: originIata ? { originIata, enabled: true } : undefined,
  });

  const strategy = originIata
    ? buildOriginFlexStub(originIata.toUpperCase(), parsed.data.baselineCashUsd ?? 0)
    : brief.strategies.find((s) => s.id === parsed.data.strategyId);
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const { options, baselineDate, notice } = await buildStrategyFlexOptions({
    strategy,
    kind: strategy.kind,
    intent: brief.intent,
    searchAirports: brief.searchAirports,
    dateFlexDays: parsed.data.dateFlexDays,
    cabinClass: cabinFromGenome(genome),
  });

  return NextResponse.json({
    flex: {
      strategyId: strategy.id,
      strategyTitle: strategy.title,
      kind: strategy.kind,
      baselineDate,
      notice,
      options,
    },
  });
}
