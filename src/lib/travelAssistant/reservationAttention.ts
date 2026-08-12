import { buildTripTransportRoute, type TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { reservationMissingPrice, type TripSpendReservation } from "@/lib/travelAssistant/tripSpendSummary";
import { disruptionCalmBadge, disruptionCalmKind } from "@/lib/travelAssistant/disruptionCalm";

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
    return "ring-amber-400 bg-amber-50/50 dark:ring-amber-500/50 dark:bg-amber-500/10";
  }
  // Missing price is accounting, not travel-day panic — no yellow ring.
  return "ring-black/[0.06] dark:ring-white/[0.08]";
}

export function reservationAttentionBadge(
  kind: ReservationAttentionKind,
  options?: { connectionIssue?: boolean; flightDelayed?: boolean; cancelled?: boolean },
): { label: string; className: string } | null {
  if (kind === "problem") {
    const calmKind = disruptionCalmKind({
      cancelled: options?.cancelled,
      delayed: options?.flightDelayed,
      connectionConflict: options?.connectionIssue,
    });
    return disruptionCalmBadge(calmKind === "none" ? "delay" : calmKind);
  }
  // Demote "Add miles/cash" off the primary badge — soft footer CTA on the card instead.
  return null;
}
