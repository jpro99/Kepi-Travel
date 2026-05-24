import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { debugEmailForwardHandleOwner } from "@/lib/travelAssistant/emailForwardSetupStore";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/debug-handle",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized debug handle request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden debug handle request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const handle = url.searchParams.get("handle")?.trim() ?? "";
  if (!handle) {
    return NextResponse.json({ error: "Missing handle query parameter." }, { status: 422 });
  }

  const debugResult = await debugEmailForwardHandleOwner(handle);
  routeLogger.info("Email forward handle debug lookup.", debugResult);
  return NextResponse.json({
    ok: true,
    ...debugResult,
  });
}
