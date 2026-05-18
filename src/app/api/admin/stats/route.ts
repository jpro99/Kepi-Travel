import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildAdminStatsSnapshot } from "@/lib/admin/adminMetrics";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/stats",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized admin stats request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden admin stats request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = await buildAdminStatsSnapshot();
  routeLogger.info("Admin stats snapshot generated.");
  return NextResponse.json(snapshot);
}
