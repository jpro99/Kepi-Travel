import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildStrategyFlexOptions } from "@/lib/decision/flexOptions";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  strategyId: z.string().trim().min(1).max(80),
  comfortWeight: z.number().min(0).max(1).optional(),
});

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
  const brief = buildDecisionBrief(parsed.data.prompt, genome, { comfortWeight });
  const strategy = brief.strategies.find((s) => s.id === parsed.data.strategyId);
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const { options, baselineDate, notice } = await buildStrategyFlexOptions({
    strategy,
    kind: strategy.kind,
    intent: brief.intent,
    searchAirports: brief.searchAirports,
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
