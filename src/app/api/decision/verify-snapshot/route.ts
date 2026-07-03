import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { resolveAwardBookUrl, resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import { getSearchSnapshot } from "@/lib/flights/searchSnapshotCache";
import { searchAwardAvailability } from "@/lib/flights/seatsAero";
import { searchDuffelCashQuotes } from "@/lib/providers/duffel/flightOffers";
import { enforceRateLimit } from "@/lib/rateLimit";

const BodySchema = z.object({
  snapshotId: z.string().trim().min(1).max(80),
  originIata: z.string().trim().length(3),
  kind: z.enum(["cash", "award"]),
});

/** One targeted live re-quote for a single origin — never serves a cached price, by design. */
export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "decision-verify-snapshot",
    requestId: `decision-verify-snapshot-${userId}-${Date.now()}`,
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

  const snapshot = await getSearchSnapshot(userId, parsed.data.snapshotId);
  if (!snapshot) {
    return NextResponse.json({ error: "This search has expired — run a new one." }, { status: 404 });
  }

  const origin = parsed.data.originIata.toUpperCase();

  if (parsed.data.kind === "cash") {
    const result = await searchDuffelCashQuotes({
      origins: [origin],
      destination: snapshot.destination,
      departureDate: snapshot.departDate,
      cabinClass: snapshot.cabin,
    });
    const quote = result.quotes[0];
    if (!quote) {
      return NextResponse.json({ verified: false, message: "No live cash fare found right now." });
    }
    const book = resolveCashBookUrl({
      origin: quote.origin,
      destination: quote.destination,
      departureDate: quote.departureDate,
      airline: quote.airline,
      offerId: quote.offerId,
      quotedPriceUsd: quote.totalAmountUsd,
      flightNumber: quote.flightNumber,
    });
    return NextResponse.json({
      verified: true,
      kind: "cash",
      verifiedAt: Date.now(),
      quote,
      bookUrl: book.url,
      bookLabel: book.label,
    });
  }

  const offers = await searchAwardAvailability({
    origin,
    destination: snapshot.destination,
    departDate: snapshot.departDate,
    cabin: snapshot.cabin,
  });
  const offer = [...offers].sort((a, b) => a.milesCost - b.milesCost)[0];
  if (!offer) {
    return NextResponse.json({ verified: false, message: "No live award space found right now." });
  }
  const verifyUrl = buildSeatsAeroSearchUrl({ origin, destination: snapshot.destination, departureDate: snapshot.departDate });
  const book = resolveAwardBookUrl({
    program: offer.program,
    origin,
    destination: snapshot.destination,
    departureDate: snapshot.departDate,
    milesCost: offer.milesCost,
    verifyUrl,
  });
  return NextResponse.json({
    verified: true,
    kind: "award",
    verifiedAt: Date.now(),
    offer,
    bookUrl: book.url,
    bookLabel: book.label,
  });
}
