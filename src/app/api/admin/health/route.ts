import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { buildAdminHealthSnapshot } from "@/lib/admin/adminMetrics";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/health",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized admin health request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden admin health request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("probe") === "1") {
    return NextResponse.json({ ok: true });
  }

  const snapshot = await buildAdminHealthSnapshot();
  routeLogger.info("Admin health snapshot generated.");
  return NextResponse.json(snapshot);
}
