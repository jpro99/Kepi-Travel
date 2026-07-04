// src/app/api/flights/award-search/route.ts
// POST endpoint that runs the fused cash + award search.
//
// WIRING NOTE: this references a cash adapter at "@/lib/flights/duffelAdapter".
// You already have working Duffel search in your Command Deck — create that thin
// adapter (or import your existing function) so this route reuses it instead of
// re-implementing Duffel. A stub is described in the README.

import { NextResponse } from "next/server";
import { fusedFlightSearch } from "@/lib/flights/fusedFlightSearch";
import type { FusedSearchParams, CabinClass } from "@/lib/flights/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CABINS: CabinClass[] = [
  "economy",
  "premium_economy",
  "business",
  "first",
];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const origin = String(body.origin ?? "").toUpperCase().trim();
  const destination = String(body.destination ?? "").toUpperCase().trim();
  const departDate = String(body.departDate ?? "").trim();
  const cabinInput = String(body.cabin ?? "economy") as CabinClass;

  if (origin.length !== 3 || destination.length !== 3) {
    return NextResponse.json(
      { error: "origin and destination must be 3-letter IATA codes." },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departDate)) {
    return NextResponse.json(
      { error: "departDate must be YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const params: FusedSearchParams = {
    origin,
    destination,
    departDate,
    returnDate: body.returnDate ? String(body.returnDate) : undefined,
    passengers: Math.max(1, Number(body.passengers) || 1),
    cabin: VALID_CABINS.includes(cabinInput) ? cabinInput : "economy",
    userId: body.userId ? String(body.userId) : undefined,
  };

  try {
    // Import the cash adapter lazily so the route file stays decoupled and
    // type-checks even before the adapter exists during incremental build-out.
    const { fetchDuffelCashOffers } = await import("@/lib/flights/duffelAdapter");
    const result = await fusedFlightSearch(params, fetchDuffelCashOffers);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[award-search] fused search failed:", error);
    return NextResponse.json(
      { error: "Search failed. Check server logs." },
      { status: 500 }
    );
  }
}
