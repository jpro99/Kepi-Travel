import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { isMapHelperEnabled } from "@/lib/airportNav/mapHelperStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/map-helper/status — can this signed-in user see one-tap helper chips? */
export async function GET() {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      enabled: false,
      canSubmit: false,
      canSelfEnable: false,
    });
  }
  const enabled = await isMapHelperEnabled(userId);
  const canSelfEnable = isAdminUserId(userId);
  return NextResponse.json({
    enabled,
    canSubmit: enabled,
    canSelfEnable,
    userId,
  });
}
