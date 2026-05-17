import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { inngest } from "@/inngest/client";

const BodySchema = z.object({
  mode: z.enum(["off", "mock", "auto"]).optional(),
  nowIso: z.string().datetime().optional(),
  timeoutMs: z.number().int().min(250).max(120000).optional(),
});

function isAuthorized(req: Request): boolean {
  const expectedSecret = process.env.TRAVEL_UPDATE_CRON_SECRET?.trim();
  if (!expectedSecret) {
    return true;
  }
  const headerSecret = req.headers.get("x-travel-cron-secret")?.trim();
  const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return headerSecret === expectedSecret || bearerToken === expectedSecret;
}

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
    route: "/api/travel-updates/background",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized background update request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/background",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  if (!isAuthorized(req)) {
    routeLogger.warn("Rejected background update request due to invalid secret.");
    return NextResponse.json({ error: "Unauthorized background trigger" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Background update payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const dispatchResult = await inngest.send({
      name: "travel/update.requested",
      data: {
        userId,
        mode: parsed.data.mode,
        nowIso: parsed.data.nowIso,
        timeoutMs: parsed.data.timeoutMs,
        trigger: "background-route",
      },
    });
    routeLogger.info("Queued background update event.", {
      mode: parsed.data.mode ?? null,
      nowIso: parsed.data.nowIso ?? null,
      timeoutMs: parsed.data.timeoutMs ?? null,
    });
    return NextResponse.json(
      {
        queued: true,
        event: dispatchResult,
      },
      { status: 202 },
    );
  } catch (error) {
    routeLogger.error("Failed to dispatch background update event.", error instanceof Error ? error : undefined, {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    const message = error instanceof Error ? error.message : "Failed to dispatch background update event.";
    return NextResponse.json(
      { error: message, queued: false },
      { status: 503 },
    );
  }
}
