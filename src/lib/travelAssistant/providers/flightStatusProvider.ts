import { z } from "zod";
import type {
  TravelUpdateEvent,
  TravelUpdateProvider,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";
import {
  clampDelayMinutes,
  createTimeoutSignal,
  ensureSummary,
  normalizeLocationToken,
  normalizeProviderCode,
} from "@/lib/travelAssistant/providers/providerUtils";
import { createMockTravelUpdateProvider } from "@/lib/travelAssistant/providers/mockTransportProvider";
import { logger } from "@/lib/logger";

const AVIATIONSTACK_BASE_URL = "https://api.aviationstack.com/v1/flights";
const AVIATIONSTACK_STATUSES = [
  "scheduled",
  "active",
  "landed",
  "cancelled",
  "diverted",
  "incident",
] as const;

type AviationStackFlightStatus = (typeof AVIATIONSTACK_STATUSES)[number];
type FlightGovernanceStatus = "green" | "yellow" | "red";

const FlightStatusSchema = z.object({
  flight: z.object({
    iata: z.string().trim().min(1).nullable().optional(),
  }),
  departure: z.object({
    iata: z.string().trim().min(1).nullable().optional(),
    scheduled: z.string().trim().min(1).nullable().optional(),
    estimated: z.string().trim().min(1).nullable().optional(),
    gate: z.string().trim().min(1).nullable().optional(),
    terminal: z.string().trim().min(1).nullable().optional(),
  }),
  arrival: z.object({
    iata: z.string().trim().min(1).nullable().optional(),
    scheduled: z.string().trim().min(1).nullable().optional(),
    estimated: z.string().trim().min(1).nullable().optional(),
    gate: z.string().trim().min(1).nullable().optional(),
    terminal: z.string().trim().min(1).nullable().optional(),
  }),
  flight_status: z.enum(AVIATIONSTACK_STATUSES),
});

const AviationStackEnvelopeSchema = z.object({
  data: z.array(FlightStatusSchema).default([]),
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
    })
    .optional(),
});

interface FlightProviderConfig {
  apiKey: string;
}

function resolveFlightProviderConfig(): FlightProviderConfig | null {
  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return { apiKey };
}

function parseDateToMs(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function calculateDelayMinutes(args: {
  scheduledDeparture: string | null | undefined;
  estimatedDeparture: string | null | undefined;
  scheduledArrival: string | null | undefined;
  estimatedArrival: string | null | undefined;
}): number | undefined {
  const departureScheduledMs = parseDateToMs(args.scheduledDeparture);
  const departureEstimatedMs = parseDateToMs(args.estimatedDeparture);
  if (!Number.isNaN(departureScheduledMs) && !Number.isNaN(departureEstimatedMs)) {
    return clampDelayMinutes(Math.round((departureEstimatedMs - departureScheduledMs) / 60000));
  }

  const arrivalScheduledMs = parseDateToMs(args.scheduledArrival);
  const arrivalEstimatedMs = parseDateToMs(args.estimatedArrival);
  if (!Number.isNaN(arrivalScheduledMs) && !Number.isNaN(arrivalEstimatedMs)) {
    return clampDelayMinutes(Math.round((arrivalEstimatedMs - arrivalScheduledMs) / 60000));
  }
  return undefined;
}

function mapAviationStatusToGovernanceStatus(
  status: AviationStackFlightStatus,
  delayMinutes: number | undefined,
): FlightGovernanceStatus {
  if (status === "cancelled" || status === "diverted" || status === "incident") {
    return "red";
  }
  if (typeof delayMinutes === "number" && delayMinutes >= 20) {
    return "yellow";
  }
  return "green";
}

function extractFlightNumber(reservation: UpdatableReservation): string | null {
  const fromTitle = reservation.title
    .toUpperCase()
    .match(/\b([A-Z0-9]{2,3})[\s-]?(\d{1,4}[A-Z]?)\b/);
  if (fromTitle) {
    return `${fromTitle[1]}${fromTitle[2]}`;
  }

  const normalizedConfirmation = reservation.confirmationCode.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
  if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(normalizedConfirmation)) {
    return normalizedConfirmation;
  }
  return null;
}

function selectBestFlightSnapshot(
  snapshots: readonly z.infer<typeof FlightStatusSchema>[],
  expectedFlightNumber: string,
): z.infer<typeof FlightStatusSchema> | null {
  const normalizedExpected = normalizeProviderCode(expectedFlightNumber);
  const matching = snapshots.filter(
    (snapshot) => normalizeProviderCode(snapshot.flight.iata ?? "") === normalizedExpected,
  );
  const pool = matching.length > 0 ? matching : snapshots;
  if (pool.length === 0) return null;

  return [...pool].sort((left, right) => {
    const leftTime = parseDateToMs(left.departure.scheduled);
    const rightTime = parseDateToMs(right.departure.scheduled);
    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
    if (Number.isNaN(leftTime)) return 1;
    if (Number.isNaN(rightTime)) return -1;
    return rightTime - leftTime;
  })[0];
}

function mapFlightSnapshotToUpdate(
  reservation: UpdatableReservation,
  snapshot: z.infer<typeof FlightStatusSchema>,
): TravelUpdateEvent {
  const normalizedDelay = calculateDelayMinutes({
    scheduledDeparture: snapshot.departure.scheduled,
    estimatedDeparture: snapshot.departure.estimated,
    scheduledArrival: snapshot.arrival.scheduled,
    estimatedArrival: snapshot.arrival.estimated,
  });
  const governanceStatus = mapAviationStatusToGovernanceStatus(snapshot.flight_status, normalizedDelay);
  const departureAirport = normalizeLocationToken(snapshot.departure.iata ?? "unknown");
  const arrivalAirport = normalizeLocationToken(snapshot.arrival.iata ?? "unknown");
  const routeSummary = `${departureAirport} -> ${arrivalAirport}`;
  const scheduleSummary = [
    `Dep ${snapshot.departure.scheduled ?? "n/a"}`,
    `Est dep ${snapshot.departure.estimated ?? "n/a"}`,
    `Arr ${snapshot.arrival.scheduled ?? "n/a"}`,
    `Est arr ${snapshot.arrival.estimated ?? "n/a"}`,
  ].join(" | ");

  // Build gate/terminal detail suffix
  const deptGate = snapshot.departure.gate?.trim() ?? null;
  const deptTerminal = snapshot.departure.terminal?.trim() ?? null;
  const arrGate = snapshot.arrival.gate?.trim() ?? null;
  const arrTerminal = snapshot.arrival.terminal?.trim() ?? null;
  const gateDetail = [
    deptTerminal ? `Departure Terminal ${deptTerminal}` : null,
    deptGate ? `Gate ${deptGate}` : null,
    arrTerminal ? `Arrival Terminal ${arrTerminal}` : null,
    arrGate ? `Arr Gate ${arrGate}` : null,
  ].filter(Boolean).join(" · ");

  if (governanceStatus === "red") {
    return {
      provider: "flight-status-provider",
      kind: "cancellation",
      severity: "critical",
      summary: ensureSummary(
        undefined,
        `${reservation.title} ${snapshot.flight_status === "cancelled" ? "cancelled" : snapshot.flight_status}`,
      ),
      detail: `AviationStack status ${snapshot.flight_status}. Route ${routeSummary}. ${scheduleSummary}${gateDetail ? `. ${gateDetail}` : ""}`,
      target: {
        reservationType: "flight",
        confirmationCode: reservation.confirmationCode,
        titleHint: reservation.title,
      },
    };
  }

  if (governanceStatus === "yellow" && typeof normalizedDelay === "number") {
    const severity = normalizedDelay >= 45 ? "critical" : "warning";
    return {
      provider: "flight-status-provider",
      kind: "delay",
      severity,
      summary: `${reservation.title} delayed ${normalizedDelay} minutes`,
      detail: `AviationStack status ${snapshot.flight_status}. Route ${routeSummary}. ${scheduleSummary}${gateDetail ? `. ${gateDetail}` : ""}`,
      target: {
        reservationType: "flight",
        confirmationCode: reservation.confirmationCode,
        titleHint: reservation.title,
      },
      delayMinutes: normalizedDelay,
    };
  }

  // On-time — include gate info in updatedLocation if available
  const updatedLocation = deptGate
    ? [deptTerminal ? `Terminal ${deptTerminal}` : null, `Gate ${deptGate}`].filter(Boolean).join(" · ")
    : undefined;

  return {
    provider: "flight-status-provider",
    kind: "on-time",
    severity: "info",
    summary: `${reservation.title} on time${deptGate ? ` · Gate ${deptGate}` : ""}`,
    detail: `AviationStack status ${snapshot.flight_status}. Route ${routeSummary}. ${scheduleSummary}${gateDetail ? `. ${gateDetail}` : ""}`,
    target: {
      reservationType: "flight",
      confirmationCode: reservation.confirmationCode,
      titleHint: reservation.title,
    },
    ...(updatedLocation ? { updatedLocation } : {}),
  };
}

async function runMockFallback(args: {
  reservations: readonly UpdatableReservation[];
  nowIso: string;
  reason: string;
}): Promise<TravelUpdateEvent[]> {
  logger.warn(`${args.reason}; falling back to mock transport provider.`, {
    scope: "travelAssistant/flightStatusProvider",
  });
  const fallbackProvider = createMockTravelUpdateProvider();
  const fallbackUpdates = await fallbackProvider.fetchUpdates({
    reservations: args.reservations,
    nowIso: args.nowIso,
  });
  return fallbackUpdates.filter((event) => event.target.reservationType === "flight");
}

export function createFlightStatusProviderFromEnv(): TravelUpdateProvider {
  const config = resolveFlightProviderConfig();

  return {
    name: "flight-status-provider",
    async fetchUpdates(args) {
      const candidates = args.reservations.filter((reservation) => reservation.type === "flight");
      if (candidates.length === 0) return [];
      if (!config) {
        return runMockFallback({
          reservations: candidates,
          nowIso: args.nowIso,
          reason: "AVIATIONSTACK_API_KEY is missing",
        });
      }

      const updates: TravelUpdateEvent[] = [];
      for (const reservation of candidates) {
        const flightNumber = extractFlightNumber(reservation);
        if (!flightNumber) {
          continue;
        }

        try {
          const url = new URL(AVIATIONSTACK_BASE_URL);
          url.searchParams.set("flight_iata", flightNumber);
          url.searchParams.set("access_key", config.apiKey);
          const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            signal: createTimeoutSignal(),
          });
          if (!response.ok) {
            throw new Error(`AviationStack returned ${response.status}`);
          }

          const parsedEnvelope = AviationStackEnvelopeSchema.safeParse(await response.json());
          if (!parsedEnvelope.success) {
            throw new Error("AviationStack payload validation failed");
          }
          if (parsedEnvelope.data.error?.message) {
            throw new Error(parsedEnvelope.data.error.message);
          }

          const snapshot = selectBestFlightSnapshot(parsedEnvelope.data.data, flightNumber);
          if (!snapshot) {
            continue;
          }
          updates.push(mapFlightSnapshotToUpdate(reservation, snapshot));
        } catch (error) {
          const fallbackUpdates = await runMockFallback({
            reservations: [reservation],
            nowIso: args.nowIso,
            reason: error instanceof Error ? error.message : "AviationStack request failed",
          });
          updates.push(...fallbackUpdates);
        }
      }
      return updates;
    },
  };
}

export {
  FlightStatusSchema,
  mapAviationStatusToGovernanceStatus,
  calculateDelayMinutes,
  extractFlightNumber,
};
