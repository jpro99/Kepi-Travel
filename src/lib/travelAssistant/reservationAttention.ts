import { buildTripTransportRoute, type TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { reservationMissingPrice, type TripSpendReservation } from "@/lib/travelAssistant/tripSpendSummary";

export type ReservationAttentionKind = "none" | "missing-price" | "problem";

export interface ReservationAttentionReservation extends TripSpendReservation {
  type?: string;
  flightStatus?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
}

function flightHasOperationalProblem(reservation: ReservationAttentionReservation): boolean {
  if (reservation.type !== "flight") return false;
  const status = (reservation.flightStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "diverted") return true;
  if (status === "delayed") return true;
  if (typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0) return true;
  if (reservation.flightOnTime === false) return true;
  return false;
}

export function buildTransportConflictReservationIds(
  transportReservations: TransportRouteReservation[],
): Set<string> {
  const route = buildTripTransportRoute(transportReservations);
  const ids = new Set<string>();
  for (const segment of route.segments) {
    if (segment.status !== "conflict" || !segment.reservationId) continue;
    ids.add(segment.reservationId);
  }
  return ids;
}

export function reservationAttentionKind(
  reservation: ReservationAttentionReservation,
  transportConflictIds?: Set<string>,
): ReservationAttentionKind {
  const hasConnectionIssue = Boolean(reservation.id && transportConflictIds?.has(reservation.id));
  if (flightHasOperationalProblem(reservation) || hasConnectionIssue) {
    return "problem";
  }
  if (reservationMissingPrice(reservation)) {
    return "missing-price";
  }
  return "none";
}

export function reservationAttentionRingClass(kind: ReservationAttentionKind, isPast = false): string {
  if (isPast) return "ring-slate-100 dark:ring-slate-800 opacity-55";
  if (kind === "problem") {
    return "ring-red-500 bg-red-50/40 dark:ring-red-500/70 dark:bg-red-500/10";
  }
  if (kind === "missing-price") {
    return "ring-yellow-400 bg-yellow-50/30 dark:ring-yellow-500/60 dark:bg-yellow-500/5";
  }
  return "ring-black/[0.06] dark:ring-white/[0.08]";
}

export function reservationAttentionBadge(
  kind: ReservationAttentionKind,
  options?: { connectionIssue?: boolean; flightDelayed?: boolean },
): { label: string; className: string } | null {
  if (kind === "problem") {
    if (options?.connectionIssue) {
      return {
        label: "Connection issue",
        className:
          "rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-950 dark:bg-red-500/30 dark:text-red-100",
      };
    }
    if (options?.flightDelayed) {
      return {
        label: "Flight problem",
        className:
          "rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-950 dark:bg-red-500/30 dark:text-red-100",
      };
    }
    return {
      label: "Needs attention",
      className:
        "rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-950 dark:bg-red-500/30 dark:text-red-100",
    };
  }
  if (kind === "missing-price") {
    return {
      label: "Add miles/cash",
      className:
        "rounded-full bg-yellow-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100",
    };
  }
  return null;
}
