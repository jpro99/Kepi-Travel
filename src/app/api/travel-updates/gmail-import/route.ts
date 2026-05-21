import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { getUserPlan } from "@/lib/billing/planGate";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { importGmailParsedReservations } from "@/lib/travelAssistant/gmailImportProvider";

const BodySchema = z.object({
  maxResults: z.number().int().min(1).max(50).default(10),
  lookbackDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).default(90),
  tripStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tripEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((value, context) => {
  if (!value.tripStartDate || !value.tripEndDate) {
    return;
  }
  if (value.tripStartDate > value.tripEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tripStartDate"],
      message: "tripStartDate must be on or before tripEndDate.",
    });
  }
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

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates/gmail-import",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized Gmail import request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getUserPlan(userId);
  if (plan === "free") {
    return NextResponse.json(
      {
        error: "Gmail import requires Pro.",
        requiresProFeature: "gmail-import",
      },
      { status: 402 },
    );
  }

  const baseRateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/gmail-import",
    requestId,
  });
  if (!baseRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: baseRateLimit.headers },
    );
  }

  const gmailRateLimit = await enforceRateLimit({
    policyName: "travel-updates-gmail-import",
    identifier: userId,
    route: "/api/travel-updates/gmail-import",
    requestId,
  });
  if (!gmailRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many Gmail import requests. Please retry shortly." },
      { status: 429, headers: gmailRateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Gmail import payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  void trackServerEvent({
    type: "gmail_import_triggered",
    userId,
    maxResults: parsed.data.maxResults,
    lookbackDays: parsed.data.lookbackDays,
    tripStartDate: parsed.data.tripStartDate ?? null,
    tripEndDate: parsed.data.tripEndDate ?? null,
  });

  const reservations = await importGmailParsedReservations({
    userId,
    maxResults: parsed.data.maxResults,
    lookbackDays: parsed.data.lookbackDays,
    tripStartDate: parsed.data.tripStartDate,
    tripEndDate: parsed.data.tripEndDate,
  });
  routeLogger.info("Gmail import request completed.", {
    maxResults: parsed.data.maxResults,
    lookbackDays: parsed.data.lookbackDays,
    tripStartDate: parsed.data.tripStartDate ?? null,
    tripEndDate: parsed.data.tripEndDate ?? null,
    importedCount: reservations.length,
  });
  return NextResponse.json({
    reservations,
  });
}
