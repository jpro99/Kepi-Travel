import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { hydrateReservationQuotedPrice, hydrateReservationPricing } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";

export interface TripSpendReservation {
  id: string;
  type?: string;
  title?: string;
  plannedOnly?: boolean;
  confirmationCode?: string | null;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
  notes?: string;
  originalEmailText?: string;
}

export interface TripSpendSummary {
  cashTotalUsd: number;
  pointsTotal: number;
  pricedCount: number;
  missingPriceCount: number;
  missingPriceIds: string[];
  byType: Record<string, { cashUsd: number; points: number; count: number }>;
}

/** Items on the trip ledger — excludes Command Deck placeholders, not every empty confirmation. */
export function isSpendTrackedReservation(reservation: TripSpendReservation): boolean {
  if (reservation.plannedOnly === true) return false;
  if (!reservation.title?.trim()) return false;
  const code = reservation.confirmationCode?.trim().toUpperCase() ?? "";
  if (code === "PLANNED" || code === "PENDING" || code === "SELECTED" || code === "TBD") return false;
  if (
    (reservation.type === "flight" || reservation.type === "hotel") &&
    code &&
    isPlaceholderConfirmation(reservation.confirmationCode)
  ) {
    return false;
  }
  return true;
}

function hasCashPrice(reservation: TripSpendReservation): boolean {
  return resolveReservationCashUsd(reservation) != null;
}

function hasPointsPrice(reservation: TripSpendReservation): boolean {
  return (
    typeof reservation.quotedPointsMiles === "number" &&
    Number.isFinite(reservation.quotedPointsMiles) &&
    reservation.quotedPointsMiles > 0
  );
}

export function reservationHasAnyPrice(reservation: TripSpendReservation): boolean {
  return hasCashPrice(reservation) || hasPointsPrice(reservation);
}

/** Booked / on-trip items without cash or points logged. */
export function reservationMissingPrice(reservation: TripSpendReservation): boolean {
  if (!isSpendTrackedReservation(reservation)) return false;
  return !reservationHasAnyPrice(reservation);
}

export function computeTripSpend(reservations: TripSpendReservation[]): TripSpendSummary {
  let cashTotalUsd = 0;
  let pointsTotal = 0;
  let pricedCount = 0;
  const missingPriceIds: string[] = [];
  const byType: TripSpendSummary["byType"] = {};

  const countedEmailTotals = new Set<string>();

  for (const raw of reservations) {
    const reservation = hydrateReservationPricing(raw);
    if (!isSpendTrackedReservation(reservation)) continue;

    const type = reservation.type?.trim() || "other";
    if (!byType[type]) {
      byType[type] = { cashUsd: 0, points: 0, count: 0 };
    }
    byType[type].count += 1;

    let cash = resolveReservationCashUsd(reservation) ?? 0;
    if (cash > 0 && reservation.originalEmailText?.trim()) {
      const dedupeKey = `${reservation.originalEmailText.trim().slice(0, 256)}::${cash}`;
      if (countedEmailTotals.has(dedupeKey)) {
        cash = 0;
      } else {
        countedEmailTotals.add(dedupeKey);
      }
    }
    const points = hasPointsPrice(reservation) ? Math.round(reservation.quotedPointsMiles!) : 0;

    if (cash > 0) {
      cashTotalUsd += cash;
      byType[type].cashUsd += cash;
    }
    if (points > 0) {
      pointsTotal += points;
      byType[type].points += points;
    }
    if (cash > 0 || points > 0) {
      pricedCount += 1;
    }
    if (reservationMissingPrice(reservation)) {
      missingPriceIds.push(reservation.id);
    }
  }

  return {
    cashTotalUsd,
    pointsTotal,
    pricedCount,
    missingPriceCount: missingPriceIds.length,
    missingPriceIds,
    byType,
  };
}

export function formatTripCashTotal(usd: number): string {
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatTripPointsTotal(points: number): string {
  if (points >= 1_000_000) {
    return `${(points / 1_000_000).toFixed(1).replace(/\.0$/, "")}M pts`;
  }
  if (points >= 10_000) {
    return `${Math.round(points / 1_000)}k pts`;
  }
  return `${points.toLocaleString("en-US")} pts`;
}

export function formatReservationCostLine(reservation: TripSpendReservation): string | null {
  const parts: string[] = [];
  const cashUsd = resolveReservationCashUsd(reservation);
  if (cashUsd != null && cashUsd > 0) {
    parts.push(formatTripCashTotal(cashUsd));
  }
  if (hasPointsPrice(reservation)) {
    const pts = `${reservation.quotedPointsMiles!.toLocaleString("en-US")} mi spent`;
    parts.push(reservation.pointsProgram ? `${pts} (${reservation.pointsProgram})` : pts);
  }
  if (
    typeof reservation.quotedMilesEarned === "number" &&
    Number.isFinite(reservation.quotedMilesEarned) &&
    reservation.quotedMilesEarned > 0
  ) {
    const earned = `${reservation.quotedMilesEarned.toLocaleString("en-US")} mi earned`;
    parts.push(reservation.pointsProgram ? `${earned} (${reservation.pointsProgram})` : earned);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
