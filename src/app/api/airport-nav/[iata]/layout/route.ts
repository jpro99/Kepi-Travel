import { NextResponse } from "next/server";
import { getAirportLayout } from "@/lib/airportNav/getLayout";

type Params = { params: Promise<{ iata: string }> };

/**
 * GET /api/airport-nav/[iata]/layout
 * Returns the curated AirportLayout (zones + walkway graph + POIs) for the
 * given IATA code, or 404 when no curated layout exists yet.
 * Long cache — layouts change only on curation pushes (layoutVersion bumps).
 */
export async function GET(_request: Request, { params }: Params) {
  const { iata: raw } = await params;
  const iata = decodeURIComponent(raw).trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(iata)) {
    return NextResponse.json({ error: "Invalid IATA code" }, { status: 400 });
  }

  const layout = getAirportLayout(iata);
  if (!layout) {
    return NextResponse.json(
      { error: "No curated layout for this airport yet", iata },
      { status: 404 },
    );
  }

  return NextResponse.json(layout, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
