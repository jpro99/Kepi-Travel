import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { parseTripIntent } from "@/lib/decision/intentParser";
import { rankStays } from "@/lib/decision/stayRanking";
import { searchDuffelStays } from "@/lib/providers/duffel/staySearch";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
});

/**
 * POST /api/decision/stays — the "godlike" hotel half of the Command Deck.
 * The client sends only the same prompt it analyzed; dates, destination,
 * and taste are all derived SERVER-side (intent parser + traveler genome),
 * so the UI never has to ask the traveler anything.
 */
export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-stays",
    requestId: `decision-stays-${userId}-${Date.now()}`,
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const intent = parseTripIntent(parsed.data.prompt);
  const [genome, result] = await Promise.all([
    getTravelerGenome(userId),
    searchDuffelStays({
      destinationIata: intent.destinationIata,
      checkInDate: intent.startDate,
      checkOutDate: intent.endDate,
      nights: intent.nights,
    }),
  ]);

  const ranked = result.configured ? rankStays(result.stays, genome.hotelChainPriority) : [];

  return NextResponse.json({
    configured: result.configured,
    error: result.error,
    intent: {
      destination: intent.destination,
      nights: intent.nights,
      startDate: intent.startDate,
      endDate: intent.endDate,
    },
    stays: ranked,
  });
}
