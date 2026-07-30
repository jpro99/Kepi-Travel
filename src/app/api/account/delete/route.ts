import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUserAccount } from "@/lib/account/deleteUserAccount";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  confirmation: z.literal("DELETE"),
});

/**
 * Apple App Store Guideline 5.1.1(v): account creation apps must offer in-app account deletion.
 * POST { confirmation: "DELETE" } → wipe billing/KV + delete Clerk user.
 */
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/account/delete",
  });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/account/delete",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: rateLimit.headers });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Type DELETE to confirm account deletion.',
        details: parsed.error.flatten(),
      },
      { status: 422, headers: rateLimit.headers },
    );
  }

  try {
    const result = await deleteUserAccount(userId);
    routeLogger.info("Account deletion completed.", result);
    return NextResponse.json({ ok: true, ...result }, { headers: rateLimit.headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account deletion failed.";
    routeLogger.warn("Account deletion failed.", { error: message });
    return NextResponse.json({ error: message }, { status: 500, headers: rateLimit.headers });
  }
}
