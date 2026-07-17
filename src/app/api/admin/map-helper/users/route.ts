import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  listMapHelperEnabledUserIds,
  setMapHelperEnabled,
} from "@/lib/airportNav/mapHelperStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/map-helper/users — list enabled helper user ids. */
export async function GET() {
  const access = await requireAdminApiAccess("/api/admin/map-helper/users");
  if (!access.ok) return access.response;
  const userIds = await listMapHelperEnabledUserIds();
  return NextResponse.json({ userIds });
}

const BodySchema = z.object({
  userId: z.string().trim().min(3).max(120),
  enabled: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

/** POST /api/admin/map-helper/users — toggle map helper for a user. */
export async function POST(req: Request) {
  const access = await requireAdminApiAccess("/api/admin/map-helper/users");
  if (!access.ok) return access.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const flag = await setMapHelperEnabled({
    userId: parsed.data.userId,
    enabled: parsed.data.enabled,
    enabledBy: access.userId,
    note: parsed.data.note,
  });
  return NextResponse.json({ ok: true, flag });
}
