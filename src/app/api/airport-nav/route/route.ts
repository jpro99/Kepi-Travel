import { NextResponse } from "next/server";
import { z } from "zod";
import { getAirportLayout } from "@/lib/airportNav/layouts";
import { computeRoute, snapFixToGraph } from "@/lib/airportNav/pathfinder3d";
import { fixFromGps } from "@/lib/airportNav/positionFusion";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  iata: z.string().trim().min(3).max(4),
  toPoiId: z.string().trim().min(1),
  fromLng: z.number(),
  fromLat: z.number(),
  level: z.string().default("L0"),
  accuracyM: z.number().optional().default(20),
  profile: z.enum(["default", "sprint", "accessible", "together"]).default("default"),
  credentials: z
    .object({
      tsaPreCheck: z.union([z.boolean(), z.literal("unknown")]).default("unknown"),
      clear: z.union([z.boolean(), z.literal("unknown")]).default("unknown"),
      globalEntry: z.union([z.boolean(), z.literal("unknown")]).default("unknown"),
    })
    .default({ tsaPreCheck: "unknown", clear: "unknown", globalEntry: "unknown" }),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const model = getAirportLayout(parsed.data.iata);
  if (!model) {
    return NextResponse.json({ error: "Airport not supported" }, { status: 404 });
  }

  const rawFix = fixFromGps(
    parsed.data.fromLng,
    parsed.data.fromLat,
    parsed.data.level,
    parsed.data.accuracyM,
  );
  const fix = snapFixToGraph(model, rawFix);

  const path = computeRoute({
    model,
    fix,
    toPoiId: parsed.data.toPoiId,
    credentials: parsed.data.credentials,
    profile: parsed.data.profile,
  });

  if (!path) {
    return NextResponse.json({ error: "No route found" }, { status: 422 });
  }

  return NextResponse.json({ path, fix });
}
