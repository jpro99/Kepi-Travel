import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { listInviteCodes } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/invite-codes",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized admin invite-codes request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden admin invite-codes request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = await listInviteCodes();
  return NextResponse.json({ codes });
}
