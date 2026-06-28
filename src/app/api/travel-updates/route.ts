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
import { extractConfirmationDocument } from "@/lib/travelAssistant/extractConfirmationDocument";
import {
  CONFIRMATION_SCAN_MAX_BYTES,
  confirmationScanKind,
  isConfirmationScanUpload,
} from "@/lib/travelAssistant/scannedReservationDraft";

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

const AeroDataBoxTimeSchema = z.object({
  local: z.string().trim().optional().nullable(),
  utc: z.string().trim().optional().nullable(),
});

const AeroDataBoxAirportSchema = z.object({
  iata: z.string().trim().optional().nullable(),
  name: z.string().trim().optional().nullable(),
});

const AeroDataBoxEndpointSchema = z.object({
  airport: AeroDataBoxAirportSchema.optional().nullable(),
  scheduledTime: AeroDataBoxTimeSchema.optional().nullable(),
  estimatedTime: AeroDataBoxTimeSchema.optional().nullable(),
  actualTime: AeroDataBoxTimeSchema.optional().nullable(),
  terminal: z.string().trim().optional().nullable(),
  gate: z.string().trim().optional().nullable(),
  delay: z.number().finite().optional().nullable(),
});

const AeroDataBoxFlightSchema = z.object({
  number: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  airline: z.object({ name: z.string().trim().optional().nullable() }).optional().nullable(),
  departure: AeroDataBoxEndpointSchema.optional().nullable(),
  arrival: AeroDataBoxEndpointSchema.optional().nullable(),
});

const AERODATABOX_BASE_URL = "https://prod.api.market/api/v1/aedbx/aerodatabox";

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

function chooseBestFlight(
  flights: z.infer<typeof AeroDataBoxFlightSchema>[],
): z.infer<typeof AeroDataBoxFlightSchema> | null {
  if (flights.length === 0) return null;
  // Prefer flights with live status over unknown/scheduled
  const priority = ["EnRoute", "Boarding", "GateClosed", "Departed", "Approaching", "Arrived", "Delayed", "Landed"];
  for (const status of priority) {
    const match = flights.find((f) => f.status === status);
    if (match) return match;
  }
  return flights[0] ?? null;
}

function resolveAeroDataBoxTime(endpoint: z.infer<typeof AeroDataBoxEndpointSchema> | null | undefined): string {
  if (!endpoint) return "";
  return (
    endpoint.actualTime?.utc ??
    endpoint.estimatedTime?.utc ??
    endpoint.scheduledTime?.utc ??
    ""
  );
}

function resolveAeroDataBoxStatus(status: string | null | undefined): { flightStatus: string; onTime: boolean | null } {
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled" || s === "cancelleduncertain") return { flightStatus: "cancelled", onTime: false };
  if (s === "diverted") return { flightStatus: "diverted", onTime: false };
  if (s === "delayed") return { flightStatus: "delayed", onTime: false };
  if (s === "enroute" || s === "approaching" || s === "departed") return { flightStatus: "active", onTime: null };
  if (s === "arrived" || s === "landed") return { flightStatus: "landed", onTime: null };
  if (s === "boarding" || s === "gateclosed" || s === "checkin") return { flightStatus: "boarding", onTime: null };
  if (s === "scheduled") return { flightStatus: "scheduled", onTime: null };
  return { flightStatus: status ?? "unknown", onTime: null };
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

  const apiKey = process.env.AERODATABOX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Flight lookup unavailable: AERODATABOX_API_KEY is missing." },
      { status: 503, headers: rateLimit.headers },
    );
  }

  const flightNum = parsed.data.flightNumber.replace(/\s+/gu, "").toUpperCase();
  const lookupUrl = `${AERODATABOX_BASE_URL}/flights/number/${encodeURIComponent(flightNum)}/${encodeURIComponent(parsed.data.flightDate)}`;
  routeLogger.info("AeroDataBox flight lookup request.", {
    requestQuery: parsed.data,
    lookupUrl,
    flightNum,
    flightDate: parsed.data.flightDate,
  });

  try {
    const response = await fetch(lookupUrl, {
      method: "GET",
      headers: { "x-api-market-key": apiKey, "Accept": "application/json" },
      cache: "no-store",
    });

    if (response.status === 204) {
      return NextResponse.json(
        { error: "No flight data found for that number and date." },
        { status: 404, headers: rateLimit.headers },
      );
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`AeroDataBox returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const rawJson = await response.json();
    const flightArray = Array.isArray(rawJson) ? rawJson : [rawJson];
    const parsedFlights = z.array(AeroDataBoxFlightSchema).safeParse(flightArray);
    if (!parsedFlights.success) {
      throw new Error("AeroDataBox payload validation failed.");
    }

    const best = chooseBestFlight(parsedFlights.data);
    if (!best) {
      return NextResponse.json(
        { error: "No matching flight found for that number and date." },
        { status: 404, headers: rateLimit.headers },
      );
    }

    const dep = best.departure;
    const arr = best.arrival;
    const delayMinutes =
      typeof dep?.delay === "number" && Number.isFinite(dep.delay)
        ? Math.max(0, Math.round(dep.delay))
        : typeof arr?.delay === "number" && Number.isFinite(arr.delay)
          ? Math.max(0, Math.round(arr.delay))
          : null;
    const { flightStatus, onTime } = resolveAeroDataBoxStatus(best.status);
    const computedOnTime = delayMinutes !== null ? delayMinutes <= 0 : onTime;

    const responseBody = {
      flightNumber: best.number ?? flightNum,
      airline: best.airline?.name ?? parsed.data.airline,
      flightDate: parsed.data.flightDate,
      departureAirport: dep?.airport?.iata ?? dep?.airport?.name ?? "",
      arrivalAirport: arr?.airport?.iata ?? arr?.airport?.name ?? "",
      departureTime: resolveAeroDataBoxTime(dep),
      arrivalTime: resolveAeroDataBoxTime(arr),
      departureTerminal: dep?.terminal ?? "",
      departureGate: dep?.gate ?? "",
      arrivalTerminal: arr?.terminal ?? "",
      arrivalGate: arr?.gate ?? "",
      delayMinutes,
      onTime: computedOnTime,
      flightStatus,
    };
    routeLogger.info("AeroDataBox flight lookup response.", { responseBody });
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
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "Ticket scan unavailable: ANTHROPIC_API_KEY is missing." },
        { status: 503, headers: rateLimit.headers },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400, headers: rateLimit.headers });
    }

    const upload = formData.get("file") ?? formData.get("image");
    if (!(upload instanceof File)) {
      return NextResponse.json({ error: "PDF or image file is required." }, { status: 400, headers: rateLimit.headers });
    }
    if (!isConfirmationScanUpload(upload)) {
      return NextResponse.json(
        { error: "Upload a PDF or image (JPG, PNG, WebP)." },
        { status: 422, headers: rateLimit.headers },
      );
    }
    if (upload.size <= 0 || upload.size > CONFIRMATION_SCAN_MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Upload up to 8MB." },
        { status: 413, headers: rateLimit.headers },
      );
    }

    const scanKind = confirmationScanKind(upload);
    routeLogger.info("Confirmation scan request started.", {
      fileName: upload.name,
      mimeType: upload.type,
      sizeBytes: upload.size,
      scanKind,
    });

    try {
      const draft = await extractConfirmationDocument(upload, anthropicApiKey);
      routeLogger.info("Confirmation scan extraction complete.", {
        extractedType: draft.type,
        extractedProvider: draft.provider,
        extractedLocalTime: draft.localTime,
        extractedNumber: draft.flightNumber || null,
        scanKind,
      });
      return NextResponse.json({ draft, scanKind }, { headers: rateLimit.headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown confirmation scan error.";
      routeLogger.warn("Confirmation scan failed.", { error: message, scanKind });
      return NextResponse.json({ error: `Confirmation scan failed: ${message}` }, { status: 502, headers: rateLimit.headers });
    }
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
