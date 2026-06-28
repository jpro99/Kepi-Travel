import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";

export interface TripSpendReservation {
  id: string;
  type?: string;
  title?: string;
  plannedOnly?: boolean;
  confirmationCode?: string | null;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  pointsProgram?: string;
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
  return (
    typeof reservation.quotedPriceUsd === "number" &&
    Number.isFinite(reservation.quotedPriceUsd) &&
    reservation.quotedPriceUsd > 0
  );
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

  for (const reservation of reservations) {
    if (!isSpendTrackedReservation(reservation)) continue;

    const type = reservation.type?.trim() || "other";
    if (!byType[type]) {
      byType[type] = { cashUsd: 0, points: 0, count: 0 };
    }
    byType[type].count += 1;

    const cash = hasCashPrice(reservation) ? Math.round(reservation.quotedPriceUsd!) : 0;
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
  if (hasCashPrice(reservation)) {
    parts.push(formatTripCashTotal(Math.round(reservation.quotedPriceUsd!)));
  }
  if (hasPointsPrice(reservation)) {
    const pts = `${reservation.quotedPointsMiles!.toLocaleString("en-US")} pts`;
    parts.push(reservation.pointsProgram ? `${pts} (${reservation.pointsProgram})` : pts);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
