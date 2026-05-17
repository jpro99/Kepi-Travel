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

const AMTRAK_STATUS_BASE_URL = "https://api.amtrak.com/rtt/public/v1/json/getCurrentTrainStatus";
const RAIL_STATUS_VALUES = ["on_time", "late", "cancelled", "arrived"] as const;

type RailStatus = (typeof RAIL_STATUS_VALUES)[number];
type RailGovernanceStatus = "green" | "yellow" | "red";

const RailStatusSchema = z.object({
  trainNumber: z.string().trim().min(1),
  origin: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  scheduledDeparture: z.string().trim().min(1),
  estimatedDeparture: z.string().trim().min(1).nullable().optional(),
  scheduledArrival: z.string().trim().min(1),
  estimatedArrival: z.string().trim().min(1).nullable().optional(),
  status: z.enum(RAIL_STATUS_VALUES),
});

function parseDateToMs(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function calculateRailDelayMinutes(args: {
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

function mapRawRailStatus(value: unknown, delayMinutes: number | undefined): RailStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "_");
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("arriv")) return "arrived";
  if (normalized.includes("late") || normalized.includes("delay")) return "late";
  if (typeof delayMinutes === "number" && delayMinutes > 0) return "late";
  return "on_time";
}

function mapRailStatusToGovernanceStatus(status: RailStatus, delayMinutes: number | undefined): RailGovernanceStatus {
  if (status === "cancelled") {
    return "red";
  }
  if (status === "late" && typeof delayMinutes === "number" && delayMinutes > 60) {
    return "red";
  }
  if (status === "late" && typeof delayMinutes === "number" && delayMinutes > 15) {
    return "yellow";
  }
  return "green";
}

function extractTrainNumber(reservation: UpdatableReservation): string | null {
  const fromTitle = reservation.title.match(/\b(\d{1,4}[A-Z]?)\b/i);
  if (fromTitle?.[1]) {
    return normalizeProviderCode(fromTitle[1]);
  }

  const fromConfirmation = reservation.confirmationCode.match(/\b(\d{1,4}[A-Z]?)\b/i);
  if (fromConfirmation?.[1]) {
    return normalizeProviderCode(fromConfirmation[1]);
  }
  return null;
}

function pickRawStatusRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const first = payload.find((item) => item && typeof item === "object");
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const asObject = payload as Record<string, unknown>;
  const trainArrays = [asObject.data, asObject.trains, asObject.Trains].find((value) => Array.isArray(value));
  if (Array.isArray(trainArrays)) {
    const first = trainArrays.find((item) => item && typeof item === "object");
    if (first && typeof first === "object") {
      return first as Record<string, unknown>;
    }
  }
  return asObject;
}

function normalizeRailStatusRecord(payload: unknown): z.infer<typeof RailStatusSchema> | null {
  const raw = pickRawStatusRecord(payload);
  if (!raw) {
    return null;
  }

  const scheduledDeparture =
    (raw.scheduledDeparture as string | undefined) ??
    (raw.SchDep as string | undefined) ??
    (raw.OrigSchDep as string | undefined) ??
    (raw.departure_scheduled as string | undefined);
  const estimatedDeparture =
    (raw.estimatedDeparture as string | undefined) ??
    (raw.EstDep as string | undefined) ??
    (raw.OrigEstDep as string | undefined) ??
    (raw.departure_estimated as string | undefined);
  const scheduledArrival =
    (raw.scheduledArrival as string | undefined) ??
    (raw.SchArr as string | undefined) ??
    (raw.DestSchArr as string | undefined) ??
    (raw.arrival_scheduled as string | undefined);
  const estimatedArrival =
    (raw.estimatedArrival as string | undefined) ??
    (raw.EstArr as string | undefined) ??
    (raw.DestEstArr as string | undefined) ??
    (raw.arrival_estimated as string | undefined);

  const delayMinutes = calculateRailDelayMinutes({
    scheduledDeparture,
    estimatedDeparture,
    scheduledArrival,
    estimatedArrival,
  });
  const parsed = RailStatusSchema.safeParse({
    trainNumber:
      String(raw.trainNumber ?? raw.TrainNum ?? raw.train_num ?? "").trim() ||
      String(raw.trainId ?? raw.train_id ?? "").trim(),
    origin: String(raw.origin ?? raw.Origin ?? raw.OrigCode ?? raw.origin_code ?? "").trim(),
    destination: String(raw.destination ?? raw.Destination ?? raw.DestCode ?? raw.destination_code ?? "").trim(),
    scheduledDeparture,
    estimatedDeparture: estimatedDeparture ?? null,
    scheduledArrival,
    estimatedArrival: estimatedArrival ?? null,
    status: mapRawRailStatus(raw.status ?? raw.TrainState ?? raw.train_status, delayMinutes),
  });

  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function mapRailSnapshotToUpdate(
  reservation: UpdatableReservation,
  snapshot: z.infer<typeof RailStatusSchema>,
): TravelUpdateEvent {
  const delayMinutes = calculateRailDelayMinutes({
    scheduledDeparture: snapshot.scheduledDeparture,
    estimatedDeparture: snapshot.estimatedDeparture,
    scheduledArrival: snapshot.scheduledArrival,
    estimatedArrival: snapshot.estimatedArrival,
  });
  const governanceStatus = mapRailStatusToGovernanceStatus(snapshot.status, delayMinutes);
  const routeSummary = `${normalizeLocationToken(snapshot.origin)} -> ${normalizeLocationToken(snapshot.destination)}`;

  if (snapshot.status === "cancelled" || governanceStatus === "red" && snapshot.status === "late") {
    if (snapshot.status === "cancelled") {
      return {
        provider: "rail-status-provider",
        kind: "cancellation",
        severity: "critical",
        summary: ensureSummary(undefined, `${reservation.title} cancelled`),
        detail: `Amtrak status ${snapshot.status}. Route ${routeSummary}.`,
        target: {
          reservationType: "train",
          confirmationCode: reservation.confirmationCode,
          titleHint: reservation.title,
        },
      };
    }

    return {
      provider: "rail-status-provider",
      kind: "delay",
      severity: "critical",
      summary: `${reservation.title} delayed ${delayMinutes ?? 0} minutes`,
      detail: `Amtrak status ${snapshot.status}. Route ${routeSummary}.`,
      target: {
        reservationType: "train",
        confirmationCode: reservation.confirmationCode,
        titleHint: reservation.title,
      },
      delayMinutes,
    };
  }

  if (snapshot.status === "late" || governanceStatus === "yellow") {
    return {
      provider: "rail-status-provider",
      kind: "delay",
      severity: governanceStatus === "yellow" ? "warning" : "info",
      summary: `${reservation.title} delayed ${delayMinutes ?? 0} minutes`,
      detail: `Amtrak status ${snapshot.status}. Route ${routeSummary}.`,
      target: {
        reservationType: "train",
        confirmationCode: reservation.confirmationCode,
        titleHint: reservation.title,
      },
      delayMinutes,
    };
  }

  if (snapshot.status === "arrived") {
    return {
      provider: "rail-status-provider",
      kind: "on-time",
      severity: "info",
      summary: `${reservation.title} arrived`,
      detail: `Amtrak status arrived. Route ${routeSummary}.`,
      target: {
        reservationType: "train",
        confirmationCode: reservation.confirmationCode,
        titleHint: reservation.title,
      },
    };
  }

  return {
    provider: "rail-status-provider",
    kind: "on-time",
    severity: "info",
    summary: `${reservation.title} on time`,
    detail: `Amtrak status ${snapshot.status}. Route ${routeSummary}.`,
    target: {
      reservationType: "train",
      confirmationCode: reservation.confirmationCode,
      titleHint: reservation.title,
    },
  };
}

async function runMockFallback(args: {
  reservations: readonly UpdatableReservation[];
  nowIso: string;
  reason: string;
}): Promise<TravelUpdateEvent[]> {
  logger.warn(`${args.reason}; falling back to mock transport provider.`, {
    scope: "travelAssistant/railStatusProvider",
  });
  const fallbackProvider = createMockTravelUpdateProvider();
  const fallbackUpdates = await fallbackProvider.fetchUpdates({
    reservations: args.reservations,
    nowIso: args.nowIso,
  });
  return fallbackUpdates.filter((event) => event.target.reservationType === "train");
}

export function createRailStatusProviderFromEnv(): TravelUpdateProvider {
  return {
    name: "rail-status-provider",
    async fetchUpdates(args) {
      const candidates = args.reservations.filter((reservation) => reservation.type === "train");
      if (candidates.length === 0) return [];

      const updates: TravelUpdateEvent[] = [];
      const apiKey = process.env.AMTRAK_API_KEY?.trim();
      for (const reservation of candidates) {
        const trainNumber = extractTrainNumber(reservation);
        if (!trainNumber) {
          const fallback = await runMockFallback({
            reservations: [reservation],
            nowIso: args.nowIso,
            reason: "Could not resolve train number from reservation",
          });
          updates.push(...fallback);
          continue;
        }

        try {
          const url = new URL(`${AMTRAK_STATUS_BASE_URL}/${encodeURIComponent(trainNumber)}/1/1`);
          const response = await fetch(url, {
            method: "GET",
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
            cache: "no-store",
            signal: createTimeoutSignal(),
          });
          if (!response.ok) {
            throw new Error(`Amtrak returned ${response.status}`);
          }
          const snapshot = normalizeRailStatusRecord(await response.json());
          if (!snapshot) {
            throw new Error("Amtrak payload validation failed");
          }
          updates.push(mapRailSnapshotToUpdate(reservation, snapshot));
        } catch (error) {
          const fallback = await runMockFallback({
            reservations: [reservation],
            nowIso: args.nowIso,
            reason: error instanceof Error ? error.message : "Amtrak request failed",
          });
          updates.push(...fallback);
        }
      }
      return updates;
    },
  };
}

export {
  RailStatusSchema,
  mapRailStatusToGovernanceStatus,
  calculateRailDelayMinutes,
  extractTrainNumber,
};
