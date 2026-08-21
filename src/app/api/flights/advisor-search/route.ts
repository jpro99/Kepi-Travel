import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import type { TripIntent } from "@/lib/decision/types";
import {
  buildBookAdvisorPicks,
  resolveBookAdvisorOrigins,
  type BookAdvisorPick,
} from "@/lib/flights/bookFlightAdvisorPicks";
import { runFusedSearchForTrip } from "@/lib/flights/fusedFlightSearch";
import type { FusedSearchResult } from "@/lib/flights/types";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.number().int().min(1).max(9).optional(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
});

function serializePick(pick: BookAdvisorPick) {
  const programId =
    pick.offer?.offer.kind === "award" ? pick.offer.offer.program : pick.kind === "alaska" ? "alaska" : null;
  return {
    kind: pick.kind,
    title: pick.title,
    reason: pick.reason,
    quoteUsd: pick.quoteUsd,
    milesCost: pick.milesCost,
    programLabel: pick.programLabel,
    programId,
    originIata: pick.originIata,
    destinationIata: pick.destinationIata,
    airlineLabel: pick.airlineLabel,
    stops: pick.stops,
    quoteDisclaimer: pick.quoteDisclaimer,
    ctaLabel: pick.ctaLabel,
    ctaKind: pick.ctaKind,
    alaska: pick.alaska ?? null,
    offerKind: pick.offer?.offer.kind ?? (pick.alaska ? "cash" : null),
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
    route: "flights-advisor-search",
    requestId: `flights-advisor-search-${userId}-${Date.now()}`,
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
    return NextResponse.json({ error: "Missing or invalid search fields." }, { status: 400 });
  }

  const origin = parsed.data.origin.toUpperCase();
  const destination = parsed.data.destination.toUpperCase();
  const departDate = parsed.data.departDate;
  const returnDate = parsed.data.returnDate;

  try {
    const genome = await getTravelerGenome(userId);
    const genomeIatas = genome.geoCluster.map((a) => a.iata);
    const searchAirports = resolveBookAdvisorOrigins(origin, genomeIatas);
    const preferAlaska = genome.statuses.some(
      (s) => /alaska/i.test(s.airline ?? "") || /mileage plan/i.test(s.program ?? ""),
    );
    const wantsAlaskaUpgrade = genome.instruments.some((i) => i.type === "guest_upgrade");

    const intent: TripIntent = {
      rawPrompt: `${origin} to ${destination} ${departDate}`,
      destination,
      destinationIata: destination,
      region: "",
      monthLabel: "",
      startDate: departDate,
      endDate: returnDate ?? departDate,
      nights: 0,
      seasonNote: "",
      originAirports: searchAirports,
      preferredAirlines: preferAlaska ? ["Alaska"] : undefined,
      wantsAlaskaUpgrade,
      stops: [{ name: destination, iata: destination, nights: 0 }],
    };

    const fused: FusedSearchResult | null = await runFusedSearchForTrip(
      intent,
      searchAirports,
      genome,
      userId,
    );

    if (!fused) {
      return NextResponse.json({
        picks: [],
        originsSearched: searchAirports,
        preferAlaska,
        headline: null,
        warnings: ["Live flight search timed out — try Refresh, or compare on Google Flights."],
        offers: [],
      });
    }

    const picks = buildBookAdvisorPicks({
      result: fused,
      requestedOrigin: origin,
      preferAlaska,
    });

    return NextResponse.json({
      picks: picks.map(serializePick),
      originsSearched: fused.meta.cashOriginsSearched,
      preferAlaska,
      headline: fused.headline ?? null,
      warnings: fused.warnings,
      offers: fused.offers.slice(0, 12),
      originCashLeaderboard: fused.originCashLeaderboard ?? [],
      params: fused.params,
    });
  } catch (error) {
    console.error("[advisor-search] failed:", error);
    return NextResponse.json({ error: "Flight advisor search failed — try again." }, { status: 500 });
  }
}
