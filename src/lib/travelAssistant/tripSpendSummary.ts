import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  enrichReservationFromTripPeers,
  hydrateReservationPricing,
} from "@/lib/travelAssistant/hydrateReservationQuotedPrice";

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

/** Booked / on-trip items without cash or points logged. Pass allReservations to parse notes/email text. */
export function reservationMissingPrice(
  reservation: TripSpendReservation,
  allReservations?: TripSpendReservation[],
): boolean {
  if (!isSpendTrackedReservation(reservation)) return false;
  const hydrated =
    allReservations && allReservations.length > 0
      ? hydrateReservationPricing(enrichReservationFromTripPeers(reservation, allReservations))
      : hydrateReservationPricing(reservation);
  return !reservationHasAnyPrice(hydrated);
}

export function computeTripSpend(reservations: TripSpendReservation[]): TripSpendSummary {
  let cashTotalUsd = 0;
  let pointsTotal = 0;
  let pricedCount = 0;
  const missingPriceIds: string[] = [];
  const byType: TripSpendSummary["byType"] = {};

  const countedEmailTotals = new Set<string>();

  for (const raw of reservations) {
    const reservation = hydrateReservationPricing(enrichReservationFromTripPeers(raw, reservations));
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
    if (reservationMissingPrice(reservation, reservations)) {
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

function shouldShowSharedEmailCashOnLeg(
  reservation: TripSpendReservation,
  cashUsd: number,
  allReservations: TripSpendReservation[],
): boolean {
  if (!reservation.originalEmailText?.trim()) return true;
  const dedupeKey = `${reservation.originalEmailText.trim().slice(0, 256)}::${cashUsd}`;
  const sorted = [...allReservations].sort((left, right) =>
    (left.id ?? "").localeCompare(right.id ?? ""),
  );
  const firstLeg = sorted.find((candidate) => {
    const hydrated = hydrateReservationPricing(enrichReservationFromTripPeers(candidate, allReservations));
    if (resolveReservationCashUsd(hydrated) !== cashUsd) return false;
    if (!hydrated.originalEmailText?.trim()) return false;
    return `${hydrated.originalEmailText.trim().slice(0, 256)}::${cashUsd}` === dedupeKey;
  });
  return !firstLeg || firstLeg.id === reservation.id;
}

export function formatReservationCostLine(
  reservation: TripSpendReservation,
  options?: { allReservations?: TripSpendReservation[] },
): string | null {
  const peers = options?.allReservations ?? [];
  const hydrated = hydrateReservationPricing(
    peers.length > 0 ? enrichReservationFromTripPeers(reservation, peers) : reservation,
  );
  const parts: string[] = [];
  const cashUsd = resolveReservationCashUsd(hydrated);
  if (
    cashUsd != null &&
    cashUsd > 0 &&
    (peers.length === 0 || shouldShowSharedEmailCashOnLeg(hydrated, cashUsd, peers))
  ) {
    parts.push(formatTripCashTotal(cashUsd));
  }
  if (hasPointsPrice(hydrated)) {
    const pts = `${hydrated.quotedPointsMiles!.toLocaleString("en-US")} mi spent`;
    parts.push(hydrated.pointsProgram ? `${pts} (${hydrated.pointsProgram})` : pts);
  }
  if (
    typeof hydrated.quotedMilesEarned === "number" &&
    Number.isFinite(hydrated.quotedMilesEarned) &&
    hydrated.quotedMilesEarned > 0
  ) {
    const earned = `${hydrated.quotedMilesEarned.toLocaleString("en-US")} mi earned`;
    parts.push(hydrated.pointsProgram ? `${earned} (${hydrated.pointsProgram})` : earned);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
