import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  deleteCalendarEvent,
  syncAllReservations,
} from "@/lib/travelAssistant/calendarSyncService";
import { readTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";

const ReservationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flight", "hotel", "train", "ride", "dinner"]),
  title: z.string().min(1),
  confirmationCode: z.string().min(1),
  localTime: z.string().min(1),
  location: z.string().min(1),
  timezone: z.string().min(1),
  provider: z.string().optional(),
  notes: z.string().optional(),
});

const PostBodySchema = z.object({
  reservations: z.array(ReservationSchema).optional(),
});

const DeleteBodySchema = z.object({
  reservationId: z.string().min(1),
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
    route: "/api/travel-updates/calendar-sync",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized calendar sync request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/calendar-sync",
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
    payload = {};
  }

  const parsed = PostBodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Calendar sync payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const runtimeState = await readTravelRuntimeState();
  const reservations = parsed.data.reservations ?? runtimeState.reservations;

  const result = await syncAllReservations(userId, reservations);
  routeLogger.info("Calendar sync request completed.", {
    reservationCount: reservations.length,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
  });
  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export async function DELETE(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates/calendar-sync",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized calendar delete request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/calendar-sync",
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
    payload = {};
  }

  const parsed = DeleteBodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Calendar delete payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const deleted = await deleteCalendarEvent(userId, parsed.data.reservationId);
  routeLogger.info("Calendar delete request completed.", {
    reservationId: parsed.data.reservationId,
    deleted,
  });
  return NextResponse.json({ ok: true, deleted });
}
