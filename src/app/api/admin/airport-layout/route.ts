import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  parseAirportLayout,
  validateAirportLayoutGraph,
} from "@/lib/airportNav/airportLayoutPackage";
import {
  getStoredAirportLayoutPackage,
  listAirportLayoutRevisionRecords,
  saveAirportLayoutPackage,
} from "@/lib/airportNav/airportLayoutStore";

const SourceSchema = z.object({
  ownership: z.literal("kepi_original"),
  attribution: z.string().trim().min(1),
  sourceUrls: z.array(z.string().url()).default([]),
  licenseNote: z.string().trim().min(1),
  lastVerifiedAt: z.string().trim().min(1),
});

const BodySchema = z.object({
  iata: z.string().trim().regex(/^[A-Za-z]{3}$/),
  layout: z.unknown(),
  status: z.enum(["draft", "published"]).default("draft"),
  source: SourceSchema,
  precisionGrade: z.enum(["schematic", "surveyed"]).default("schematic"),
  /** Admin attests the rendered visual preview looked physically correct. Required to publish. */
  previewConfirmed: z.boolean().default(false),
  /** Validate the layout only; never write anything. */
  dryRun: z.boolean().default(false),
});

export async function GET(request: Request) {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout");
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const iata = url.searchParams.get("iata")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(iata)) {
    return NextResponse.json({ error: "A valid iata query parameter is required" }, { status: 400 });
  }

  const [published, draft, historyRecords] = await Promise.all([
    getStoredAirportLayoutPackage(iata, "published"),
    getStoredAirportLayoutPackage(iata, "draft"),
    listAirportLayoutRevisionRecords(iata),
  ]);
  // History is metadata-only for the admin UI; strip inline layouts to keep the response light.
  const history = historyRecords.map(({ layout: _layout, ...metadata }) => metadata);
  return NextResponse.json({ iata, published, draft, history });
}

export async function POST(request: Request) {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout");
  if (!gate.ok) return gate.response;

  try {
    const parsedBody = BodySchema.parse(await request.json());
    const iata = parsedBody.iata.toUpperCase();
    const layout = parseAirportLayout(parsedBody.layout);
    if (layout.iata !== iata) {
      return NextResponse.json(
        { error: `Body IATA ${iata} does not match layout IATA ${layout.iata}` },
        { status: 400 },
      );
    }

    if (parsedBody.dryRun) {
      // parseAirportLayout already threw on structural issues; report a clean bill.
      return NextResponse.json({
        message: `${iata} layout passed structural validation.`,
        valid: true,
        issues: validateAirportLayoutGraph(layout),
        stats: {
          zones: layout.zones.length,
          nodes: layout.nodes.length,
          edges: layout.edges.length,
          pois: layout.pois.length,
        },
      });
    }

    if (parsedBody.status === "published" && !parsedBody.previewConfirmed) {
      return NextResponse.json(
        {
          error:
            "Publishing requires visual preview confirmation. Render the draft on the map preview and confirm it looks physically correct first.",
        },
        { status: 400 },
      );
    }

    const saved = await saveAirportLayoutPackage(layout, parsedBody.source, {
      status: parsedBody.status,
      precisionGrade: parsedBody.precisionGrade,
      previewConfirmation: parsedBody.previewConfirmed
        ? { by: gate.userId }
        : undefined,
    });
    return NextResponse.json({
      message: `${iata} airport layout ${parsedBody.status}.`,
      package: saved,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid airport layout package", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save airport layout package" },
      { status: 400 },
    );
  }
}
