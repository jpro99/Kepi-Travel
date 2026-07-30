import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  enrichReservationFromTripPeers,
  hydrateReservationPricing,
  type PricingPeerResolvable,
} from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import type { CashUsdResolvable } from "@/lib/travelAssistant/parseReservationCashUsd";
import type { MilesResolvable } from "@/lib/travelAssistant/parseReservationMiles";

export interface TripSpendReservation {
  id: string;
  type?: string;
  title?: string;
  plannedOnly?: boolean;
  confirmationCode?: string | null;
  sourceEmailId?: string;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
  notes?: string;
  originalEmailText?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
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
  return resolveReservationCashUsd(asPricingInput(reservation)) != null;
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

type SpendPricingInput = CashUsdResolvable & MilesResolvable & PricingPeerResolvable & { id: string };

function asPricingInput(reservation: TripSpendReservation): SpendPricingInput {
  return {
    id: reservation.id,
    sourceEmailId: reservation.sourceEmailId,
    quotedPriceUsd: reservation.quotedPriceUsd,
    quotedPointsMiles: reservation.quotedPointsMiles,
    quotedMilesEarned: reservation.quotedMilesEarned,
    pointsProgram: reservation.pointsProgram,
    notes: reservation.notes,
    originalEmailText: reservation.originalEmailText,
    confirmationCode: reservation.confirmationCode ?? undefined,
    title: reservation.title,
    flightNumber: reservation.flightNumber,
    flightDepartureAirport: reservation.flightDepartureAirport,
    flightArrivalAirport: reservation.flightArrivalAirport,
  };
}

function hydrateSpendReservation(
  reservation: TripSpendReservation,
  allReservations: TripSpendReservation[],
): TripSpendReservation {
  const normalized = asPricingInput(reservation);
  const normalizedPeers = allReservations.map(asPricingInput);
  const enriched = enrichReservationFromTripPeers(normalized, normalizedPeers);
  const hydrated = hydrateReservationPricing(enriched);
  return { ...reservation, ...hydrated };
}

/** Multi-leg bookings that share one confirmation or one forwarded email. */
export function reservationPricingPeerGroup(
  reservation: TripSpendReservation,
  allReservations: TripSpendReservation[],
): TripSpendReservation[] {
  const tracked = allReservations.filter(isSpendTrackedReservation);
  const code = reservation.confirmationCode?.trim().toUpperCase();
  if (code) {
    const byCode = tracked.filter(
      (peer) => peer.confirmationCode?.trim().toUpperCase() === code,
    );
    if (byCode.length > 1) return byCode;
  }

  const emailId = reservation.sourceEmailId?.trim();
  if (emailId) {
    const byEmailId = tracked.filter((peer) => peer.sourceEmailId?.trim() === emailId);
    if (byEmailId.length > 1) return byEmailId;
  }

  const emailKey = hydrateSpendReservation(reservation, allReservations).originalEmailText
    ?.trim()
    .slice(0, 256);
  if (emailKey) {
    const byEmailText = tracked.filter((peer) => {
      const peerKey = hydrateSpendReservation(peer, allReservations).originalEmailText
        ?.trim()
        .slice(0, 256);
      return peerKey === emailKey;
    });
    if (byEmailText.length > 1) return byEmailText;
  }

  return [reservation];
}

export function reservationGroupHasAnyPrice(
  reservation: TripSpendReservation,
  allReservations: TripSpendReservation[],
): boolean {
  return reservationPricingPeerGroup(reservation, allReservations).some((peer) =>
    reservationHasAnyPrice(hydrateSpendReservation(peer, allReservations)),
  );
}

/** Booked / on-trip items without cash or points logged. Pass allReservations to parse notes/email text. */
export function reservationMissingPrice(
  reservation: TripSpendReservation,
  allReservations?: TripSpendReservation[],
): boolean {
  if (!isSpendTrackedReservation(reservation)) return false;
  if (!allReservations || allReservations.length === 0) {
    const hydrated = hydrateReservationPricing(asPricingInput(reservation));
    return !reservationHasAnyPrice({ ...hydrated, id: reservation.id });
  }
  if (reservationGroupHasAnyPrice(reservation, allReservations)) {
    return false;
  }
  return !reservationHasAnyPrice(hydrateSpendReservation(reservation, allReservations));
}

export function computeTripSpend(reservations: TripSpendReservation[]): TripSpendSummary {
  let cashTotalUsd = 0;
  let pointsTotal = 0;
  let pricedCount = 0;
  const missingPriceIds: string[] = [];
  const byType: TripSpendSummary["byType"] = {};

  const countedEmailTotals = new Set<string>();

  for (const raw of reservations) {
    const reservation = hydrateSpendReservation(raw, reservations);
    if (!isSpendTrackedReservation(reservation)) continue;

    const type = reservation.type?.trim() || "other";
    if (!byType[type]) {
      byType[type] = { cashUsd: 0, points: 0, count: 0 };
    }
    byType[type].count += 1;

    let cash = resolveReservationCashUsd(asPricingInput(reservation)) ?? 0;
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

export interface TripSpendLineItem {
  id: string;
  type: string;
  title: string;
  cashUsd?: number;
  points?: number;
  needsPrice: boolean;
}

/** Itemized spend for the pricing review sheet (I42). */
export function buildTripSpendLineItems(reservations: TripSpendReservation[]): TripSpendLineItem[] {
  const items: TripSpendLineItem[] = [];
  for (const raw of reservations) {
    if (!isSpendTrackedReservation(raw)) continue;
    const reservation = hydrateSpendReservation(raw, reservations);
    const cash = resolveReservationCashUsd(asPricingInput(reservation));
    const points = hasPointsPrice(reservation) ? Math.round(reservation.quotedPointsMiles!) : undefined;
    const needsPrice = reservationMissingPrice(reservation, reservations);
    items.push({
      id: reservation.id,
      type: (reservation.type ?? "other").trim() || "other",
      title: reservation.title?.trim() || "Reservation",
      cashUsd: cash != null && cash > 0 ? cash : undefined,
      points: points != null && points > 0 ? points : undefined,
      needsPrice,
    });
  }
  // Needs-price first, then by type.
  return items.sort((a, b) => {
    if (a.needsPrice !== b.needsPrice) return a.needsPrice ? -1 : 1;
    return a.type.localeCompare(b.type) || a.title.localeCompare(b.title);
  });
}

export function formatTripCashTotal(usd: number): string {
  const whole = Number.isInteger(usd);
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
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
  const normalizedPeers = allReservations.map(asPricingInput);
  const firstLeg = sorted.find((candidate) => {
    const hydrated = hydrateReservationPricing(
      enrichReservationFromTripPeers(asPricingInput(candidate), normalizedPeers),
    );
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
  const normalized = asPricingInput(reservation);
  const normalizedPeers = peers.map(asPricingInput);
  const hydrated = hydrateReservationPricing(
    peers.length > 0 ? enrichReservationFromTripPeers(normalized, normalizedPeers) : normalized,
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
