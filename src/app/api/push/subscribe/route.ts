import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { getUserPlan } from "@/lib/billing/planGate";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { subscribeUser } from "@/lib/travelAssistant/pushNotificationService";

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

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

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/push/subscribe",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized push key request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getUserPlan(userId);
  if (plan !== "pro") {
    return NextResponse.json(
      {
        error: "Push notifications require Pro.",
        requiresProFeature: "push-notifications",
      },
      { status: 402 },
    );
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    routeLogger.warn("VAPID public key is missing.");
    return NextResponse.json({ error: "VAPID public key is not configured." }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/push/subscribe",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized push subscribe request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getUserPlan(userId);
  if (plan !== "pro") {
    return NextResponse.json(
      {
        error: "Push notifications require Pro.",
        requiresProFeature: "push-notifications",
      },
      { status: 402 },
    );
  }

  const rateLimit = await enforceRateLimit({
    policyName: "push-subscribe",
    identifier: userId,
    route: "/api/push/subscribe",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    routeLogger.warn("Push subscribe payload is invalid JSON.");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PushSubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Push subscribe payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  await subscribeUser(userId, parsed.data);
  routeLogger.info("Push subscription saved.");
  return NextResponse.json({ ok: true });
}
