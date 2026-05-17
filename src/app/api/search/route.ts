import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Feature, Polygon } from "geojson";
import { defaultCityId, getCityCatalog } from "@/data/cities/registry";
import { logger } from "@/lib/logger";
import { enrichHitsWithWalking } from "@/lib/search/enrichWithWalking";
import type { RoutingProvider } from "@/lib/search/types";
import { searchHotelsInPolygon } from "@/lib/search/scoreAndFilter";

const PositionSchema = z.tuple([z.number(), z.number()]);

const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(PositionSchema).min(4))
    .min(1)
    .refine(
      (rings) => rings.every((r) => r.length >= 4),
      "Each ring needs at least 4 positions",
    ),
});

const BodySchema = z.object({
  cityId: z.string().min(1).max(64).optional(),
  area: z.object({
    type: z.literal("Feature"),
    geometry: PolygonSchema,
  }),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const routeLogger = logger.withContext({
    requestId,
    route: "/api/search",
  });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    routeLogger.warn("Search request rejected due to invalid JSON body.");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    routeLogger.warn("Search request payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const cityId = parsed.data.cityId ?? defaultCityId;
  const catalog = getCityCatalog(cityId);
  if (!catalog) {
    routeLogger.warn("Search request referenced unknown city.", { cityId });
    return NextResponse.json(
      { error: `Unknown cityId: ${cityId}` },
      { status: 404 },
    );
  }

  const area: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: parsed.data.area.geometry,
  };
  const baseHits = searchHotelsInPolygon(area, catalog);
  const anchor = catalog.touristAnchors[0];
  const hotels = await enrichHitsWithWalking(baseHits, catalog);

  const configured: RoutingProvider = process.env.OPENROUTESERVICE_API_KEY
    ? "openrouteservice"
    : "osrm";

  const engineUsed =
    hotels.find((h) => h.walkingToCore || h.walkingToTransit)
      ?.routingProvider ?? null;

  const engine: RoutingProvider =
    engineUsed ?? (hotels.length === 0 ? configured : "none");

  let routingNote: string;
  if (engineUsed === "openrouteservice") {
    routingNote =
      "Walking times via OpenRouteService (foot-walking), cached 24h per segment.";
  } else if (engineUsed === "osrm") {
    routingNote =
      "Walking times via OSRM public demo (foot profile), cached 24h. For higher quotas add OPENROUTESERVICE_API_KEY.";
  } else if (hotels.length > 0) {
    routingNote =
      "No pedestrian route returned for these pairs (common across water). Scores use straight-line distance.";
  } else {
    routingNote =
      "No hotels matched the polygon. Walking times appear once matches exist.";
  }

  routeLogger.info("Completed hotel search request.", {
    cityId: catalog.id,
    hotelCount: hotels.length,
    routingEngine: engine,
  });

  return NextResponse.json({
    hotels,
    meta: {
      cityId: catalog.id,
      cityLabel: catalog.label,
      anchorLabel: anchor?.label ?? "Not configured",
      hotelCountScanned: catalog.hotels.length,
      routing: {
        mode: "foot" as const,
        engine,
        note: routingNote,
      },
    },
  });
}
