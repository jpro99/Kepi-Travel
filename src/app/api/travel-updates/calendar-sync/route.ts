import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  deleteCalendarEvent,
  isCalendarSyncConfigured,
  syncAllReservations,
} from "@/lib/travelAssistant/calendarSyncService";
import {
  filterCalendarSyncReservations,
  toCalendarSyncReservationPayload,
  type CalendarSyncReservationPayload,
} from "@/lib/travelAssistant/calendarSyncPayload";
import { readTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import { generateId } from "@/lib/utils/generateId";

const ReservationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flight", "hotel", "train", "ride", "dinner"]),
  title: z.string().optional(),
  confirmationCode: z.string().optional(),
  localTime: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
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
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
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
  // Explicit shape (not inferred) because `parsed.data.reservations` and
  // `runtimeState.reservations` are two different types that both satisfy
  // filterCalendarSyncReservations's generic constraint individually, but
  // TS can't unify them across the `??` union for generic inference. Every
  // field here is already read defensively below (?? / ?.), so this is a
  // type-only normalization, not a behavior change.
  const incoming: Array<{
    id: string;
    type: string;
    title?: string;
    confirmationCode?: string;
    localTime?: string;
    location?: string;
    timezone?: string;
    provider?: string;
    notes?: string;
  }> = parsed.data.reservations ?? runtimeState.reservations;
  const reservations = filterCalendarSyncReservations(incoming).map((reservation) =>
    toCalendarSyncReservationPayload({
      id: reservation.id,
      type: reservation.type as CalendarSyncReservationPayload["type"],
      title: reservation.title ?? "",
      confirmationCode: reservation.confirmationCode,
      localTime: reservation.localTime ?? "",
      location: reservation.location ?? "",
      timezone: reservation.timezone ?? "Etc/UTC",
      provider: reservation.provider,
      notes: reservation.notes,
    }),
  );
  const unavailable = !isCalendarSyncConfigured(userId);

  if (reservations.length === 0) {
    routeLogger.info("Calendar sync skipped — no sync-ready reservations.", {
      incomingCount: incoming.length,
      unavailable,
    });
    return NextResponse.json({
      ok: true,
      totalReservations: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      unavailable,
      results: [],
    });
  }

  const result = await syncAllReservations(userId, reservations);
  routeLogger.info("Calendar sync request completed.", {
    reservationCount: reservations.length,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    unavailable,
  });
  return NextResponse.json({
    ok: true,
    unavailable,
    ...result,
  });
}

export async function DELETE(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
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
