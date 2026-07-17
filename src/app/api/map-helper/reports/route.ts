import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { isMapHelperEnabled, submitMapHelperReport } from "@/lib/airportNav/mapHelperStore";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["confirm_poi", "confirm_door"]),
  iata: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  poiId: z.string().trim().min(1).max(120).optional(),
  poiName: z.string().trim().min(1).max(160).optional(),
  poiCategory: z.string().trim().min(1).max(40).optional(),
  doorLabel: z.string().trim().min(1).max(40).optional(),
  nodeId: z.string().trim().min(1).max(120).optional(),
  pos: z.tuple([z.number(), z.number()]),
  accuracyM: z.number().finite().nullable().optional(),
  layoutVersion: z.string().trim().max(80).optional(),
});

/** POST /api/map-helper/reports — one-tap confirm from a map helper. */
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isMapHelperEnabled(userId))) {
    return NextResponse.json({ error: "Map helper not enabled for this account." }, { status: 403 });
  }

  const limited = await enforceRateLimit({
    policyName: "map-helper-report",
    identifier: userId,
    route: "/api/map-helper/reports",
    requestId,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many confirms — try again later." },
      { status: 429, headers: limited.headers },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload" }, { status: 400 });
  }

  const body = parsed.data;
  if (body.kind === "confirm_door" && !body.doorLabel) {
    return NextResponse.json({ error: "doorLabel required" }, { status: 400 });
  }
  if (body.kind === "confirm_poi" && !body.poiId) {
    return NextResponse.json({ error: "poiId required" }, { status: 400 });
  }

  const report = await submitMapHelperReport({
    kind: body.kind,
    iata: body.iata,
    userId,
    poiId: body.poiId,
    poiName: body.poiName,
    poiCategory: body.poiCategory,
    doorLabel: body.doorLabel,
    nodeId: body.nodeId,
    pos: body.pos,
    accuracyM: body.accuracyM ?? null,
    layoutVersion: body.layoutVersion,
  });

  return NextResponse.json({ ok: true, report });
}
