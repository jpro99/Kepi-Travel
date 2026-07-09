import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { sendDisruptionAlert } from "@/lib/email/emailService";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { runTravelUpdateCheck } from "@/lib/travelAssistant/updateAdapters";
import { persistTravelUpdateAudit } from "@/lib/travelAssistant/updateAuditStore";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type { TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";
import { generateId } from "@/lib/utils/generateId";
import { maybeSendFlightStatusPushAlerts } from "@/lib/travelAssistant/flightStatusPushBridge";
import { handleConfirmationScanUpload } from "@/lib/travelAssistant/confirmationScanHandler";
import {
  fetchMergedFlightStatusSnapshot,
  mergedSnapshotToFlightLookupResponse,
} from "@/lib/travelAssistant/flightStatusLookup";
import { resolveAeroDataBoxApiKey } from "@/lib/travelAssistant/flightStatusSources/aeroDataBoxSource";

export const maxDuration = 60;
export const runtime = "nodejs";

const ReservationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flight", "train", "ride", "hotel", "dinner"]),
  title: z.string().min(1),
  confirmationCode: z.string().min(1),
  localTime: z.string().min(1),
  location: z.string().min(1),
  timezone: z.string().min(1),
});

const BodySchema = z.object({
  mode: z.enum(["off", "mock", "auto"]).default("auto"),
  nowIso: z.string().datetime().optional(),
  reservations: z.array(ReservationSchema),
});

const FlightLookupQuerySchema = z.object({
  action: z.literal("flight-lookup"),
  flightNumber: z.string().trim().min(2).max(16),
  airline: z.string().trim().min(2).max(120),
  flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
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

function pickDisruptionUpdate(updates: readonly TravelUpdateEvent[]): TravelUpdateEvent | null {
  return (
    updates.find((update) => update.kind === "cancellation" || update.severity === "critical") ??
    updates.find((update) => update.kind === "delay" && (update.delayMinutes ?? 0) >= 20) ??
    null
  );
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates",
    method: "GET",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized travel updates lookup request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const url = new URL(req.url);
  const parsed = FlightLookupQuerySchema.safeParse({
    action: url.searchParams.get("action"),
    flightNumber: url.searchParams.get("flightNumber"),
    airline: url.searchParams.get("airline"),
    flightDate: url.searchParams.get("flightDate"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const apiKey = resolveAeroDataBoxApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Flight lookup unavailable: AERODATABOX_API_KEY is missing." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  const flightNum = parsed.data.flightNumber.replace(/\s+/gu, "").toUpperCase();
  routeLogger.info("Merged flight lookup request.", {
    requestQuery: parsed.data,
    flightNum,
    flightDate: parsed.data.flightDate,
  });

  try {
    const merged = await fetchMergedFlightStatusSnapshot({
      flightNumber: flightNum,
      flightDate: parsed.data.flightDate,
    });
    if (!merged) {
      return NextResponse.json(
        { error: "No flight data found for that number and date." },
        { status: 404, headers: rateLimit.headers },
      );
    }

    const responseBody = mergedSnapshotToFlightLookupResponse(merged, parsed.data.airline);
    routeLogger.info("Merged flight lookup response.", { responseBody });
    const pushResult = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber: responseBody.flightNumber,
      flightDate: responseBody.flightDate,
      departureGate: responseBody.departureGate,
      delayMinutes: responseBody.delayMinutes,
      flightStatus: responseBody.flightStatus,
    });
    return NextResponse.json(
      { ...responseBody, pushAlertsSent: pushResult.sent },
      { headers: rateLimit.headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown flight lookup error.";
    routeLogger.warn("Flight lookup failed.", { error: message });
    return NextResponse.json({ error: `Flight lookup failed: ${message}` }, { status: 502, headers: rateLimit.headers });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized travel update request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const url = new URL(req.url);
  if (url.searchParams.get("action") === "ticket-scan") {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
    routeLogger.info("Confirmation scan request started (legacy query route).");
    return handleConfirmationScanUpload(req, {
      anthropicApiKey,
      rateLimitHeaders: rateLimit.headers,
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    routeLogger.warn("Rejected travel update request due to invalid JSON body.");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("Travel update payload validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const effectiveNowIso = parsed.data.nowIso ?? new Date().toISOString();
  const hasFlightLookup = parsed.data.reservations.some((reservation) => reservation.type === "flight");
  if (hasFlightLookup) {
    routeLogger.info("Travel update flight lookup request.", {
      requestBody: parsed.data,
    });
  }
  await persistTravelRuntimeState({
    reservations: parsed.data.reservations,
    mode: parsed.data.mode,
    updatedAt: effectiveNowIso,
  });

  const result = await runTravelUpdateCheck({
    mode: parsed.data.mode,
    reservations: parsed.data.reservations,
    nowIso: effectiveNowIso,
  });

  const audit = await persistTravelUpdateAudit({
    result,
    checkedAt: effectiveNowIso,
    source: "interactive",
  });

  routeLogger.info("Travel update check completed.", {
    mode: parsed.data.mode,
    reservationCount: parsed.data.reservations.length,
    incomingUpdates: result.updates.length,
    freshUpdates: audit.freshUpdates.length,
    duplicateUpdates: audit.duplicateUpdates,
  });

  const disruptionUpdate = pickDisruptionUpdate(audit.freshUpdates);
  if (disruptionUpdate) {
    const affectedReservation =
      parsed.data.reservations.find(
        (reservation) =>
          reservation.confirmationCode === disruptionUpdate.target.confirmationCode ||
          reservation.title === disruptionUpdate.target.titleHint,
      ) ?? null;
    void sendDisruptionAlert(userId, {
      affectedReservationTitle: affectedReservation?.title ?? disruptionUpdate.target.titleHint ?? "Affected reservation",
      disruptionType: disruptionUpdate.kind,
      severity: disruptionUpdate.severity,
      detail: disruptionUpdate.detail,
      affectedReservationId: affectedReservation?.id,
    });
  }

  const responseBody = {
    ...result,
    updates: audit.freshUpdates,
    audit: audit.summary,
  };
  if (hasFlightLookup) {
    routeLogger.info("Travel update flight lookup response.", {
      responseBody,
    });
  }

  return NextResponse.json(responseBody);
}
