import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { runFusedFlightSearch } from "@/lib/flights/fusedFlightSearch";

const BodySchema = z.object({
  origins: z.array(z.string().trim().length(3)).min(1).max(5),
  destination: z.string().trim().length(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
});

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "ai-suggestions",
    identifier: userId,
    route: "flights-award-search",
    requestId: `flights-award-search-${userId}-${Date.now()}`,
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

  const result = await runFusedFlightSearch(parsed.data, userId);

  console.log("[fused-flight-search]", {
    cashOffers: result.cashOffers.length,
    awardOffers: result.awardOffers.length,
    fused: result.fused.length,
    headline: result.headline,
    duffel: result.meta.duffelConfigured,
    seatsAero: result.meta.seatsAeroConfigured,
  });

  return NextResponse.json(result);
}
