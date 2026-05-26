import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
const TICKET_SCAN_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type ScannedReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";

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

function normalizeScannedReservationType(rawType: unknown): ScannedReservationType {
  if (typeof rawType !== "string") {
    return "ride";
  }
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "flight" || normalized === "hotel" || normalized === "train" || normalized === "ride") {
    return normalized;
  }
  if (normalized === "restaurant" || normalized === "meal" || normalized === "dining" || normalized === "dinner") {
    return "dinner";
  }
  if (normalized === "car" || normalized === "rental" || normalized === "taxi" || normalized === "transfer") {
    return "ride";
  }
  return "ride";
}

function normalizeScannedDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return "";
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u.exec(trimmed);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1] ?? "", 10);
    const day = Number.parseInt(slashMatch[2] ?? "", 10);
    const yearRaw = slashMatch[3] ?? "";
    const year = Number.parseInt(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw, 10);
    if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(year)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return "";
  }
  const date = new Date(parsed);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeScannedTime(rawTime: string): string {
  const trimmed = rawTime.trim();
  if (!trimmed) {
    return "";
  }
  const twelveHourMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/iu.exec(trimmed);
  if (twelveHourMatch) {
    let hour = Number.parseInt(twelveHourMatch[1] ?? "", 10);
    const minute = Number.parseInt(twelveHourMatch[2] ?? "", 10);
    const meridiem = (twelveHourMatch[3] ?? "").toUpperCase();
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return "";
    }
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFourHourMatch = /^(\d{1,2}):(\d{2})$/u.exec(trimmed);
  if (twentyFourHourMatch) {
    const hour = Number.parseInt(twentyFourHourMatch[1] ?? "", 10);
    const minute = Number.parseInt(twentyFourHourMatch[2] ?? "", 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return "";
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return "";
}

function defaultStageForScannedType(type: ScannedReservationType): "airport" | "arrival" | "readiness" {
  if (type === "flight" || type === "train") {
    return "airport";
  }
  if (type === "hotel" || type === "ride") {
    return "arrival";
  }
  return "readiness";
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
    return NextResponse.json(responseBody, { headers: rateLimit.headers });
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

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400, headers: rateLimit.headers });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Uploaded file must be an image." }, { status: 422, headers: rateLimit.headers });
    }
    if (image.size <= 0 || image.size > TICKET_SCAN_MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Upload an image up to 8MB." },
        { status: 413, headers: rateLimit.headers },
      );
    }

    routeLogger.info("Ticket scan request started.", {
      fileName: image.name,
      mimeType: image.type,
      sizeBytes: image.size,
    });

    try {
      const imageBase64 = Buffer.from(await image.arrayBuffer()).toString("base64");
      const client = new Anthropic({ apiKey: anthropicApiKey });
      const scanResponse = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 900,
        temperature: 0,
        system: [
          "You extract reservation details from ticket images.",
          "Input images may be airline boarding passes, Japanese rail tickets, hotel confirmations, or restaurant reservations.",
          "Read multilingual text including Japanese when present.",
          "Return strict JSON only.",
          "Use this exact shape:",
          '{ "reservation": { "type": "", "provider": "", "title": "", "date": "", "time": "", "timezone": "", "confirmationCode": "", "departureAirport": "", "arrivalAirport": "", "location": "", "flightOrTrainNumber": "", "roomType": "", "checkOutDate": "", "notes": "" } }',
          "type must be one of: flight, hotel, train, ride, dinner.",
          "CRITICAL: Only extract what is explicitly visible in the image. NEVER guess, infer, or assume any field.",
          "For flights, time = DEPARTURE time (when plane leaves gate), NOT boarding time, NOT check-in time, NOT gate open time. Departure time is labeled Departs, Departure, or shown next to the origin airport code.",
          "If the year is not shown in the image, set date to empty string — do NOT assume the current year or any year.",
          "If any field is unclear or not visible, return empty string for that field.",
          "Use ISO date YYYY-MM-DD only when the full date including year is clearly visible. Use 24-hour HH:mm for time.",
          "Do not invent confirmation codes, dates, or any other fields.",
          "For flights: departureAirport = the IATA code of the origin airport (e.g. HND, LAX, HNL). arrivalAirport = the IATA code of the destination airport. Extract from the ticket — they are always shown.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.type,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Extract reservation fields from this ticket image.",
              },
            ],
          },
        ],
      });

      const modelText = scanResponse.content
        .filter((block): block is Extract<(typeof scanResponse.content)[number], { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const jsonStart = modelText.indexOf("{");
      const jsonEnd = modelText.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < jsonStart) {
        throw new Error("Ticket scan model returned an invalid response.");
      }
      const parsed = JSON.parse(modelText.slice(jsonStart, jsonEnd + 1)) as unknown;
      const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const reservationNode =
        root.reservation && typeof root.reservation === "object" && !Array.isArray(root.reservation)
          ? (root.reservation as Record<string, unknown>)
          : root;

      const scannedType = normalizeScannedReservationType(reservationNode.type);
      const provider = typeof reservationNode.provider === "string" ? reservationNode.provider.trim() : "";
      const title = typeof reservationNode.title === "string" ? reservationNode.title.trim() : "";
      const date = normalizeScannedDate(typeof reservationNode.date === "string" ? reservationNode.date : "");
      const time = normalizeScannedTime(typeof reservationNode.time === "string" ? reservationNode.time : "");
      const timezone =
        typeof reservationNode.timezone === "string" && reservationNode.timezone.trim().length > 0
          ? reservationNode.timezone.trim()
          : "Etc/UTC";
      const confirmationCode =
        typeof reservationNode.confirmationCode === "string" ? reservationNode.confirmationCode.trim() : "";
      const location = typeof reservationNode.location === "string" ? reservationNode.location.trim() : "";
      const numberValue =
        typeof reservationNode.flightOrTrainNumber === "string"
          ? reservationNode.flightOrTrainNumber.trim()
          : typeof reservationNode.flightNumber === "string"
            ? reservationNode.flightNumber.trim()
            : typeof reservationNode.trainNumber === "string"
              ? reservationNode.trainNumber.trim()
              : "";
      const departureAirport = typeof reservationNode.departureAirport === "string"
        ? reservationNode.departureAirport.trim().toUpperCase().slice(0, 4)
        : "";
      const arrivalAirport = typeof reservationNode.arrivalAirport === "string"
        ? reservationNode.arrivalAirport.trim().toUpperCase().slice(0, 4)
        : "";
      const localTime =
        typeof reservationNode.localTime === "string" && reservationNode.localTime.trim().length > 0
          ? reservationNode.localTime.trim()
          : date && time
            ? `${date} ${time}`
            : date
              ? `${date} 12:00`
              : "";
      const notes = typeof reservationNode.notes === "string" ? reservationNode.notes.trim() : "";
      const roomType = typeof reservationNode.roomType === "string" ? reservationNode.roomType.trim() : "";
      const checkOutDate = normalizeScannedDate(
        typeof reservationNode.checkOutDate === "string" ? reservationNode.checkOutDate : "",
      );

      const draft = {
        type: scannedType,
        title: title || `${provider || "Scanned"} reservation`,
        provider: provider || title || (scannedType === "hotel" ? "Hotel" : scannedType === "flight" ? "Flight" : "Reservation"),
        localTime,
        timezone,
        location,
        confirmationCode,
        assignedTo: [] as string[],
        stage: defaultStageForScannedType(scannedType),
        critical: scannedType === "flight" || scannedType === "train" || scannedType === "ride",
        confidence: "medium" as const,
        notes,
        flightNumber: scannedType === "flight" ? numberValue : "",
        flightAirline: scannedType === "flight" ? provider : "",
        flightDate: scannedType === "flight" ? date : "",
        flightDepartureAirport: scannedType === "flight" ? departureAirport : "",
        flightArrivalAirport: scannedType === "flight" ? arrivalAirport : "",
        checkOutDate: scannedType === "hotel" ? checkOutDate : "",
        roomType: scannedType === "hotel" ? roomType : "",
      };
      routeLogger.info("Ticket scan extraction complete.", {
        extractedType: draft.type,
        extractedProvider: draft.provider,
        extractedLocalTime: draft.localTime,
        extractedNumber: numberValue || null,
      });
      return NextResponse.json({ draft }, { headers: rateLimit.headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ticket scan error.";
      routeLogger.warn("Ticket scan failed.", { error: message });
      return NextResponse.json({ error: `Ticket scan failed: ${message}` }, { status: 502, headers: rateLimit.headers });
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
