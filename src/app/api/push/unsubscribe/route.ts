import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { logger } from "@/lib/logger";
import { unsubscribeUser } from "@/lib/travelAssistant/pushNotificationService";

const BodySchema = z.object({}).passthrough();

async function resolveAuthenticatedUserId(): Promise<string | null> {
  const isTestEnv = isAutomatedTestRuntime();
  try {
    const clerkServer = await import("@clerk/nextjs/server");
    const session = await clerkServer.auth();
    if (session.userId) {
      return session.userId;
    }
    return isTestEnv ? "test-user" : null;
  } catch {
    return isTestEnv ? "test-user" : null;
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/push/unsubscribe",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized push unsubscribe request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Push unsubscribe payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  await unsubscribeUser(userId);
  routeLogger.info("Push subscription removed.");
  return NextResponse.json({ ok: true });
}
