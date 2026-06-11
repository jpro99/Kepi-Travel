import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { activateStrategy } from "@/lib/decision/activateStrategy";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  strategyId: z.string().trim().min(1),
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
  const brief = buildDecisionBrief(parsed.data.prompt, genome);
  const strategy = brief.strategies.find((s) => s.id === parsed.data.strategyId);
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const result = await activateStrategy(strategy, brief.intent, userId ?? undefined);
  return NextResponse.json({ activation: result, strategyTitle: strategy.title });
}
