import { NextResponse } from "next/server";
import { hasArrivalsCoverage, recordAirportCurationDemand } from "@/lib/airportNav/airportCurationQueue";
import { buildAirportLayoutApiResponseHeaders } from "@/lib/airportNav/airportLayoutApiHeaders";
import { resolvePublishedAirportLayout } from "@/lib/airportNav/airportLayoutStore";

export const dynamic = "force-dynamic";

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
    // No layout at all — obviously no arrivals coverage either.
    const curation = await recordAirportCurationDemand(iata, { arrivalsMissing: true });
    return NextResponse.json(
      {
        error: "No curated layout for this airport yet",
        iata,
        curationStatus: curation.status,
        demandCount: curation.demandCount,
      },
      { status: 404 },
    );
  }

  // Real trip demand for this airport just showed up (via this request) — if
  // its layout has no customs/baggage/ground-transport nodes yet, that's a
  // second, independent curation gap worth queuing (M40 follow-up). Doesn't
  // change the response; the honest fallback for arrivals stays whatever it
  // already is elsewhere.
  if (!hasArrivalsCoverage(layout)) {
    await recordAirportCurationDemand(iata, {
      detectedBy: "layout-api-arrivals-gap",
      arrivalsMissing: true,
    });
  }

  return NextResponse.json(layout, {
    headers: buildAirportLayoutApiResponseHeaders({
      iata,
      layoutVersion: layout.layoutVersion,
      revision: resolved.package?.revision ?? 0,
      source: resolved.source,
      edgeCount: layout.edges.length,
      nodeCount: layout.nodes.length,
    }),
  });
}
