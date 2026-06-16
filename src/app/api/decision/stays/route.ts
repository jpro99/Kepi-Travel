import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { parseTripIntent } from "@/lib/decision/intentParser";
import { allocateStopDates } from "@/lib/decision/stopDates";
import { rankStays } from "@/lib/decision/stayRanking";
import {
  buildEstimatedStays,
  estimatedStaysNotice,
  resolveStaysMode,
} from "@/lib/providers/duffel/fallbackStays";
import { searchDuffelStays } from "@/lib/providers/duffel/staySearch";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

async function quotesForStop(input: {
  destinationIata: string;
  destinationCity: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  chainPriority: string[];
  mockMode: boolean;
}): Promise<{ quotes: Awaited<ReturnType<typeof searchDuffelStays>>["stays"]; source: "duffel" | "estimated"; error?: string }> {
  const liveResult = mockMode
    ? { configured: false, stays: [], error: undefined as string | undefined }
    : await searchDuffelStays({
        destinationIata: input.destinationIata,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights: input.nights,
      });

  let quotes = liveResult.stays;
  let source: "duffel" | "estimated" = quotes.length > 0 ? "duffel" : "estimated";

  if (quotes.length === 0) {
    const estimated = buildEstimatedStays({
      destinationIata: input.destinationIata,
      destinationCity: input.destinationCity,
      nights: input.nights,
      chainPriority: input.chainPriority,
    });
    if (estimated.length > 0) {
      quotes = estimated;
    }
  }

  return { quotes, source, error: liveResult.error };
}

/**
 * POST /api/decision/stays — hotel half of the Command Deck.
 * Multi-city intents return one ranked carousel per leg.
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
  const genome = await getTravelerGenome(userId);
  const mockMode = resolveStaysMode() === "mock";
  const stopRanges = allocateStopDates(intent);

  if (stopRanges.length > 0) {
    const legs = await Promise.all(
      stopRanges.map(async (range) => {
        const iata = range.stop.iata ?? intent.destinationIata;
        const { quotes, source, error } = await quotesForStop({
          destinationIata: iata,
          destinationCity: range.stop.name,
          checkInDate: range.checkIn,
          checkOutDate: range.checkOut,
          nights: range.nights,
          chainPriority: genome.hotelChainPriority,
          mockMode,
        });
        return {
          stopName: range.stop.name,
          iata,
          checkInDate: range.checkIn,
          checkOutDate: range.checkOut,
          nights: range.nights,
          source,
          error,
          stays: quotes.length > 0 ? rankStays(quotes, genome.hotelChainPriority) : [],
        };
      }),
    );

    const primary = legs[0];
    const anyEstimated = legs.some((leg) => leg.source === "estimated");
    const flatStays = legs.flatMap((leg) => leg.stays);

    return NextResponse.json({
      configured: !mockMode,
      source: anyEstimated ? "estimated" : "duffel",
      notice: anyEstimated ? estimatedStaysNotice(undefined, mockMode) : undefined,
      error: flatStays.length === 0 ? "No hotels available for these cities." : undefined,
      intent: {
        destination: intent.destination,
        nights: intent.nights,
        startDate: intent.startDate,
        endDate: intent.endDate,
        isMultiCity: true,
      },
      stopLegs: legs,
      stays: flatStays.slice(0, 8),
    });
  }

  const { quotes, source, error: liveError } = await quotesForStop({
    destinationIata: intent.destinationIata,
    destinationCity: intent.destination,
    checkInDate: intent.startDate,
    checkOutDate: intent.endDate,
    nights: intent.nights,
    chainPriority: genome.hotelChainPriority,
    mockMode,
  });

  const ranked = quotes.length > 0 ? rankStays(quotes, genome.hotelChainPriority) : [];

  return NextResponse.json({
    configured: !mockMode,
    source,
    notice: source === "estimated" ? estimatedStaysNotice(liveError, mockMode) : undefined,
    error: ranked.length === 0 ? (liveError ?? "No hotels available for this destination.") : undefined,
    intent: {
      destination: intent.destination,
      nights: intent.nights,
      startDate: intent.startDate,
      endDate: intent.endDate,
      isMultiCity: false,
    },
    stays: ranked,
  });
}
