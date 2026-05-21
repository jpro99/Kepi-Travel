import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { createInviteCode } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  type: z.union([z.literal("lifetime"), z.literal("trial-30")]),
  note: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/invite/generate",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized invite generation request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden invite generation request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/invite/generate",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invite generation requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const code = await createInviteCode({
    type: parsed.data.type,
    note: parsed.data.note,
    createdBy: userId,
  });
  routeLogger.info("Invite code generated.", {
    inviteType: code.type,
    inviteCode: code.code,
  });

  return NextResponse.json({ code }, { headers: rateLimit.headers });
}
