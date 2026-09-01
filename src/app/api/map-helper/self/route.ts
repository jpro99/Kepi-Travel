import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import {
  isMapHelperEnabled,
  setMapHelperEnabled,
} from "@/lib/airportNav/mapHelperStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/map-helper/self — admin-only self toggle.
 * Lets Jeff turn map-helper chips on for his account only, without hunting the users table.
 */
const BodySchema = z.object({
  enabled: z.boolean(),
});

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    return NextResponse.json(
      { error: "Only admins can enable map helper for themselves." },
      { status: 403 },
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
    return NextResponse.json({ error: "enabled boolean required" }, { status: 400 });
  }

  const flag = await setMapHelperEnabled({
    userId,
    enabled: parsed.data.enabled,
    enabledBy: userId,
    note: "self-enable (admin)",
  });
  const enabled = await isMapHelperEnabled(userId);
  return NextResponse.json({
    ok: true,
    enabled,
    canSelfEnable: true,
    flag,
  });
}
