import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { fusedFlightSearch } from "@/lib/flights/fusedFlightSearch";
import { fetchDuffelCashOffers } from "@/lib/flights/duffelAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const BodySchema = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.number().int().min(1).max(9).optional(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
});

export async function POST(req: Request) {
  const userId = (await resolveAuthenticatedUserId()) ?? "anonymous";

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

  const params = {
    origin: parsed.data.origin.toUpperCase(),
    destination: parsed.data.destination.toUpperCase(),
    departDate: parsed.data.departDate,
    returnDate: parsed.data.returnDate,
    passengers: parsed.data.passengers ?? 1,
    cabin: parsed.data.cabin ?? ("economy" as const),
    userId,
  };

  try {
    const result = await fusedFlightSearch(params, fetchDuffelCashOffers);

    console.log("[fused-flight-search]", {
      meta: result.meta,
      headline: result.headline,
      warnings: result.warnings,
      topScore: result.offers[0]?.score,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[fused-flight-search] failed:", error);
    return NextResponse.json({ error: "Search failed. Check server logs." }, { status: 500 });
  }
}
