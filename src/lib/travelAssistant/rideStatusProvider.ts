import { z } from "zod";
import type {
  TravelUpdateEvent,
  TravelUpdateProvider,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { clampDelayMinutes } from "@/lib/travelAssistant/providers/providerUtils";
import { createMockTravelUpdateProvider } from "@/lib/travelAssistant/providers/mockTransportProvider";
import { logger } from "@/lib/logger";

const RIDE_STATUS_VALUES = ["on_time", "late", "cancelled", "arrived"] as const;

type RideStatus = (typeof RIDE_STATUS_VALUES)[number];
type RideGovernanceStatus = "green" | "yellow" | "red";

const RideStatusSnapshotSchema = z.object({
  status: z.enum(RIDE_STATUS_VALUES),
  driverName: z.string().trim().min(1).nullable(),
  eta: z.string().trim().min(1).nullable(),
  vehicleDescription: z.string().trim().min(1).nullable(),
  trackingUrl: z.string().url().nullable(),
});

const lastKnownRideStatusByKey = new Map<string, z.infer<typeof RideStatusSnapshotSchema>>();

function deterministicHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildRideKey(rideConfirmationNumber: string, phoneNumber: string): string {
  return `${rideConfirmationNumber}|${phoneNumber}`;
}

function parseDateInput(value: string): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function mapRideStatusToGovernanceStatus(status: RideStatus): RideGovernanceStatus {
  if (status === "cancelled") {
    return "red";
  }
  if (status === "late") {
    return "yellow";
  }
  return "green";
}

function resolveRideContactPhone(reservation: UpdatableReservation): string {
  const fromCode = reservation.confirmationCode.match(/(\+?\d[\d -]{6,}\d)/);
  if (fromCode?.[1]) {
    return fromCode[1].replaceAll(/\s+/g, "");
  }
  return process.env.TRAVEL_RIDE_CONTACT_PHONE?.trim() || "+10000000000";
}

function mapRideSnapshotToUpdate(args: {
  reservation: UpdatableReservation;
  snapshot: z.infer<typeof RideStatusSnapshotSchema>;
}): TravelUpdateEvent {
  const governance = mapRideStatusToGovernanceStatus(args.snapshot.status);
  const metadataSummary = [
    args.snapshot.driverName ? `Driver: ${args.snapshot.driverName}` : null,
    args.snapshot.vehicleDescription ? `Vehicle: ${args.snapshot.vehicleDescription}` : null,
    args.snapshot.eta ? `ETA: ${new Date(args.snapshot.eta).toLocaleString()}` : null,
    args.snapshot.trackingUrl ? `Track: ${args.snapshot.trackingUrl}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (governance === "red") {
    return {
      provider: "ride-status-provider",
      kind: "cancellation",
      severity: "critical",
      summary: `${args.reservation.title} ride cancelled`,
      detail: metadataSummary || "Ride-share update indicates cancellation.",
      target: {
        reservationType: "ride",
        confirmationCode: args.reservation.confirmationCode,
        titleHint: args.reservation.title,
      },
    };
  }

  if (governance === "yellow") {
    const scheduledMs = parseDateInput(args.reservation.localTime);
    const etaMs = args.snapshot.eta ? Date.parse(args.snapshot.eta) : Number.NaN;
    const delayMinutes =
      !Number.isNaN(scheduledMs) && !Number.isNaN(etaMs)
        ? clampDelayMinutes(Math.round((etaMs - scheduledMs) / 60000))
        : undefined;
    return {
      provider: "ride-status-provider",
      kind: "delay",
      severity: "warning",
      summary:
        typeof delayMinutes === "number" && delayMinutes > 0
          ? `${args.reservation.title} delayed ${delayMinutes} minutes`
          : `${args.reservation.title} running late`,
      detail: metadataSummary || "Ride-share update indicates a late pickup.",
      target: {
        reservationType: "ride",
        confirmationCode: args.reservation.confirmationCode,
        titleHint: args.reservation.title,
      },
      delayMinutes,
    };
  }

  return {
    provider: "ride-status-provider",
    kind: "on-time",
    severity: "info",
    summary:
      args.snapshot.status === "arrived" ? `${args.reservation.title} driver arrived` : `${args.reservation.title} on time`,
    detail: metadataSummary || "Ride-share update indicates on-time pickup.",
    target: {
      reservationType: "ride",
      confirmationCode: args.reservation.confirmationCode,
      titleHint: args.reservation.title,
    },
  };
}

async function pollRideStatus(args: {
  rideConfirmationNumber: string;
  phoneNumber: string;
  nowIso: string;
}): Promise<z.infer<typeof RideStatusSnapshotSchema>> {
  if (process.env.RIDE_STATUS_STUB_FORCE_ERROR === "true") {
    throw new Error("Ride status stub forced failure.");
  }
  if (!args.rideConfirmationNumber.trim() || !args.phoneNumber.trim()) {
    throw new Error("Missing ride confirmation number or phone number.");
  }

  // TODO: Replace with Uber/Lyft webhook when API access is granted.
  const seed = deterministicHash(`${args.rideConfirmationNumber}:${args.phoneNumber}:${args.nowIso.slice(0, 13)}`);
  const status: RideStatus = seed % 21 === 0 ? "cancelled" : seed % 5 === 0 ? "late" : seed % 9 === 0 ? "arrived" : "on_time";
  const eta = new Date(Date.parse(args.nowIso) + (7 + (seed % 18)) * 60_000).toISOString();
  return RideStatusSnapshotSchema.parse({
    status,
    driverName: status === "cancelled" ? null : `Driver ${String.fromCharCode(65 + (seed % 26))}.`,
    eta: status === "cancelled" ? null : eta,
    vehicleDescription: status === "cancelled" ? null : `${2017 + (seed % 8)} Silver Sedan`,
    trackingUrl: `https://rides.example.com/track/${encodeURIComponent(args.rideConfirmationNumber)}`,
  });
}

async function runMockFallback(args: {
  reservations: readonly UpdatableReservation[];
  nowIso: string;
  reason: string;
}): Promise<TravelUpdateEvent[]> {
  logger.warn(`${args.reason}; falling back to mock transport provider.`, {
    scope: "travelAssistant/rideStatusProvider",
  });
  const fallbackProvider = createMockTravelUpdateProvider();
  const fallbackUpdates = await fallbackProvider.fetchUpdates({
    reservations: args.reservations,
    nowIso: args.nowIso,
  });
  return fallbackUpdates.filter((event) => event.target.reservationType === "ride");
}

export function createRideStatusProviderFromEnv(): TravelUpdateProvider {
  return {
    name: "ride-status-provider",
    async fetchUpdates(args) {
      const candidates = args.reservations.filter((reservation) => reservation.type === "ride");
      if (candidates.length === 0) return [];

      const updates: TravelUpdateEvent[] = [];
      for (const reservation of candidates) {
        const phoneNumber = resolveRideContactPhone(reservation);
        const rideKey = buildRideKey(reservation.confirmationCode, phoneNumber);

        try {
          const snapshot = await pollRideStatus({
            rideConfirmationNumber: reservation.confirmationCode,
            phoneNumber,
            nowIso: args.nowIso,
          });
          lastKnownRideStatusByKey.set(rideKey, snapshot);
          updates.push(
            mapRideSnapshotToUpdate({
              reservation,
              snapshot,
            }),
          );
        } catch (error) {
          const fallbackSnapshot = lastKnownRideStatusByKey.get(rideKey);
          if (fallbackSnapshot) {
            logger.warn("Ride poll failed; using last known ride status.", {
              scope: "travelAssistant/rideStatusProvider",
              error,
              confirmationCode: reservation.confirmationCode,
            });
            updates.push(
              mapRideSnapshotToUpdate({
                reservation,
                snapshot: fallbackSnapshot,
              }),
            );
            continue;
          }
          const fallbackUpdates = await runMockFallback({
            reservations: [reservation],
            nowIso: args.nowIso,
            reason: error instanceof Error ? error.message : "Ride status poll failed",
          });
          updates.push(...fallbackUpdates);
        }
      }
      return updates;
    },
  };
}

export { RideStatusSnapshotSchema, mapRideStatusToGovernanceStatus, pollRideStatus };
