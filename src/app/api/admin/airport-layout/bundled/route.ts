import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { getAirportLayout, listSupportedIndoorAirports } from "@/lib/airportNav/getLayout";
import { auditLayoutRouting } from "@/lib/airportNav/layoutQuality";

/**
 * Read-only browse of the airports bundled in code (the curated seed layouts:
 * SEA, LAX, ONT, …). Lets an admin open and visually verify any airport map on
 * demand. `?iata=XXX` returns that airport's full layout + its M29 routing-audit
 * report; no query returns the gallery list with a health summary per airport.
 */
export async function GET(request: Request) {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout/bundled");
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const iata = url.searchParams.get("iata")?.trim().toUpperCase() ?? "";

  if (iata) {
    const layout = getAirportLayout(iata);
    if (!layout) {
      return NextResponse.json({ error: `No bundled layout for ${iata}` }, { status: 404 });
    }
    const audit = auditLayoutRouting(layout);
    return NextResponse.json({ iata, name: layout.name, layout, audit });
  }

  const airports = listSupportedIndoorAirports()
    .map((code) => {
      const layout = getAirportLayout(code);
      if (!layout) return null;
      const audit = auditLayoutRouting(layout);
      return {
        iata: layout.iata,
        name: layout.name,
        layoutVersion: layout.layoutVersion,
        updatedAt: layout.updatedAt,
        routeGrade: layout.routeGrade ?? "schematic",
        counts: {
          zones: layout.zones.length,
          nodes: layout.nodes.length,
          edges: layout.edges.length,
          pois: layout.pois.length,
          gates: layout.pois.filter((p) => p.category === "gate").length,
          lounges: layout.pois.filter((p) => p.category === "lounge").length,
        },
        errors: audit.errors.length,
        warnings: audit.warnings.length,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => a.iata.localeCompare(b.iata));

  return NextResponse.json({ airports });
}
