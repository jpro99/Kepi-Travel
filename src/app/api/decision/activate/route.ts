import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { activateStrategy } from "@/lib/decision/activateStrategy";
import { buildDecisionBrief } from "@/lib/decision/strategyEngine";
import { enrichBriefWithDuffelPricing } from "@/lib/decision/livePricing";
import { enabledConnectorLegs } from "@/lib/decision/flightLegPlanner";
import { buildAlignmentBoard } from "@/lib/decision/tripAlignment";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const SelectedStaySchema = z.object({
  quoteId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  chainName: z.string().trim().max(120).optional(),
  photoUrl: z.string().trim().max(500).optional(),
  area: z.string().trim().max(120).optional(),
  totalAmountUsd: z.number().nonnegative(),
  nightlyUsd: z.number().nonnegative(),
  currency: z.string().trim().min(1).max(8),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  strategyId: z.string().trim().min(1),
  planMode: z.enum(["flights", "hotels", "full"]).optional(),
  paymentMode: z.enum(["cash", "points", "mix"]).optional(),
  enabledLegIds: z.array(z.string()).optional(),
  stay: SelectedStaySchema.optional(),
  stays: z.array(SelectedStaySchema).max(12).optional(),
});

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-activate",
    requestId: `${"decision-activate"}-${userId}-${Date.now()}`,
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
  const planMode = parsed.data.planMode ?? "flights";
  const paymentMode = parsed.data.paymentMode ?? "cash";
  const brief = buildDecisionBrief(parsed.data.prompt, genome, {
    planMode,
    paymentMode,
    enabledLegIds: parsed.data.enabledLegIds,
  });

  const strategy =
    brief.strategies.find((s) => s.id === parsed.data.strategyId) ??
    brief.strategies.find((s) => s.kind === parsed.data.strategyId);
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found — refresh and try again." }, { status: 404 });
  }

  let enrichedBrief = brief;
  if (planMode !== "hotels" && !brief.originRequired) {
    const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
    const outboundDuffel = await searchDuffelCashQuotes({
      origins: brief.searchAirports,
      destination: arrivalIata,
      departureDate: brief.intent.startDate,
    });
    let returnDuffel: Awaited<ReturnType<typeof searchDuffelCashQuotes>> | undefined;
    const homeIata = brief.searchAirports[0];
    if (brief.intent.returnAirports?.length && homeIata) {
      returnDuffel = await searchDuffelCashQuotes({
        origins: brief.intent.returnAirports,
        destination: homeIata,
        departureDate: brief.intent.endDate,
      });
    }
    const connectorLegs = enabledConnectorLegs(brief.flightLegs ?? []);
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
    enrichedBrief = enrichBriefWithDuffelPricing(
      brief,
      outboundDuffel,
      genome,
      genome.decisionWeights.comfort,
      returnDuffel,
      connectorDuffel,
    );
  }

  const selectedStays =
    parsed.data.stays && parsed.data.stays.length > 0
      ? parsed.data.stays
      : parsed.data.stay
        ? [parsed.data.stay]
        : [];

  const alignmentLegs = buildAlignmentBoard(
    enrichedBrief,
    strategy,
    selectedStays.length > 0 ? selectedStays : null,
  );

  const result = await activateStrategy(
    strategy,
    enrichedBrief.intent,
    userId ?? undefined,
    selectedStays.length > 0 ? selectedStays : null,
    alignmentLegs,
  );

  return NextResponse.json({
    activation: result,
    alignment: {
      legs: alignmentLegs,
      verifiedLegCount: result.verifiedLegCount,
      totalBookableLegs: result.totalBookableLegs,
    },
    strategyTitle: strategy.title,
  });
}
