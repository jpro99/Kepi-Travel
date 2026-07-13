import { NextResponse } from "next/server";
import { resolvePublishedAirportLayout } from "@/lib/airportNav/airportLayoutStore";

type Params = { params: Promise<{ iata: string }> };

/**
 * GET /api/airport-nav/[iata]/layout
 * Returns the published, versioned Kepi-owned AirportLayout for the IATA.
 * Database packages win; bundled layouts seed the database on first use.
 */
export async function GET(_request: Request, { params }: Params) {
  const { iata: raw } = await params;
  const iata = decodeURIComponent(raw).trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(iata)) {
    return NextResponse.json({ error: "Invalid IATA code" }, { status: 400 });
  }

  const resolved = await resolvePublishedAirportLayout(iata);
  const layout = resolved.layout;
  if (!layout) {
    return NextResponse.json(
      { error: "No curated layout for this airport yet", iata },
      { status: 404 },
    );
  }

  return NextResponse.json(layout, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      "ETag": `"${iata}:${resolved.package?.revision ?? 0}:${layout.layoutVersion}"`,
      "X-Kepi-Airport-Layout-Source": resolved.source,
      "X-Kepi-Airport-Layout-Revision": String(resolved.package?.revision ?? 0),
    },
  });
}
