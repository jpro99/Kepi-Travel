import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { listInviteCodes } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { listReferralCodes } from "@/lib/referral/referralStore";

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

  const [inviteCodes, referralCodes] = await Promise.all([listInviteCodes(), listReferralCodes()]);
  const codes = [
    ...inviteCodes,
    ...referralCodes.map((code) => ({
      code: code.code,
      type: "referral" as const,
      createdBy: code.userId,
      createdAt: code.createdAt,
      usedBy: code.latestUsedBy ? `${code.latestUsedBy}${code.totalUses > 1 ? ` (+${code.totalUses - 1} more)` : ""}` : null,
      usedAt: code.latestUsedAt,
      status: "active" as const,
      note: code.totalUses > 0 ? `${code.totalUses} referral redemption${code.totalUses === 1 ? "" : "s"}` : null,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return NextResponse.json({ codes });
}
