import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { validateAirportLayoutGraph } from "@/lib/airportNav/airportLayoutPackage";
import { getStoredAirportLayoutPackage } from "@/lib/airportNav/airportLayoutStore";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { diffAirportLayouts } from "@/lib/airportNav/layoutDiff";
import { importAirportFromOsm, OSM_ATTRIBUTION, OSM_LICENSE_NOTE } from "@/lib/airportNav/osmImport";

export const maxDuration = 120;

const BodySchema = z.object({
  iata: z.string().trim().regex(/^[A-Za-z]{3}$/),
  name: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout/import");
  if (!gate.ok) return gate.response;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "A valid 3-letter iata is required", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const iata = body.iata.toUpperCase();
  try {
    const result = await importAirportFromOsm(iata, body.name ?? `${iata} Airport`);
    // Structural sanity: the draft must be valid enough to render for preview.
    const issues = validateAirportLayoutGraph(result.layout);

    // Master prompt §2 / M35: never overwrite a human-verified airport silently —
    // return a POI-level diff against the current published (or bundled) layout.
    const publishedPkg = await getStoredAirportLayoutPackage(iata, "published");
    const baseline = publishedPkg?.layout ?? getAirportLayout(iata) ?? null;
    const vsPublished = baseline
      ? diffAirportLayouts(baseline, result.layout)
      : null;

    const messageParts = [
      `${iata} imported from OpenStreetMap as a draft.`,
      vsPublished ? vsPublished.summary + "." : null,
      "Review the warnings + diff, add security + real walkways, confirm the visual preview, then publish — never auto-publish over a verified airport.",
    ].filter(Boolean);

    return NextResponse.json({
      iata,
      status: "draft_preview",
      layout: result.layout,
      warnings: result.warnings,
      structuralIssues: issues,
      stats: result.stats,
      vsPublished,
      baselineSource: publishedPkg ? "published_package" : baseline ? "bundled_layout" : null,
      source: {
        ownership: "kepi_original" as const,
        attribution: OSM_ATTRIBUTION,
        sourceUrls: ["https://www.openstreetmap.org/"],
        licenseNote: OSM_LICENSE_NOTE,
        lastVerifiedAt: new Date().toISOString().slice(0, 10),
      },
      message: messageParts.join(" "),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "OSM import failed",
        iata,
        hint: "If OpenStreetMap has no usable indoor geometry here, hand-curate this airport instead.",
      },
      { status: 422 },
    );
  }
}
