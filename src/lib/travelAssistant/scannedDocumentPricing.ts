import { applyIncomingSourceToPnrGroup } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { resolveReservationMiles } from "@/lib/travelAssistant/parseReservationMiles";
import type { CashUsdResolvable } from "@/lib/travelAssistant/parseReservationCashUsd";
import type { MilesResolvable } from "@/lib/travelAssistant/parseReservationMiles";
import type { PricingPeerResolvable } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";

type PriceableReservation = CashUsdResolvable & MilesResolvable & PricingPeerResolvable & { id: string };

/** Confirmation codes on the trip that appear inside a dropped document. */
export function confirmationCodesInDocument<T extends PriceableReservation>(
  reservations: T[],
  documentText: string,
): string[] {
  const haystack = documentText.toUpperCase();
  if (!haystack.trim()) return [];

  const codes = new Set<string>();
  for (const reservation of reservations) {
    const code = reservation.confirmationCode?.trim().toUpperCase();
    if (!code || code.length < 5 || isPlaceholderConfirmation(code)) continue;
    if (haystack.includes(code)) codes.add(code);
  }
  return [...codes];
}

export interface ScannedDocumentPricingResult<T> {
  reservations: T[];
  pricedCodes: string[];
  pricedLegCount: number;
}

/**
 * G42 — dropping a PDF prices the bookings already on the trip.
 * A dropped receipt must never create duplicate legs just to carry a fare.
 */
export function applyScannedDocumentPricing<T extends PriceableReservation>(
  reservations: T[],
  documentText: string,
): ScannedDocumentPricingResult<T> {
  const text = documentText.trim();
  const codes = confirmationCodesInDocument(reservations, text);
  if (codes.length === 0) {
    return { reservations, pricedCodes: [], pricedLegCount: 0 };
  }

  let next = reservations;
  const pricedCodes: string[] = [];

  for (const code of codes) {
    const before = next;
    const applied = applyIncomingSourceToPnrGroup(next, text, code);
    const gainedPricing = applied.some((reservation, index) => {
      const previous = before[index];
      if (!previous) return false;
      const beforeCash = resolveReservationCashUsd(previous) ?? 0;
      const afterCash = resolveReservationCashUsd(reservation) ?? 0;
      const beforeMiles = resolveReservationMiles(previous).milesSpent ?? 0;
      const afterMiles = resolveReservationMiles(reservation).milesSpent ?? 0;
      return afterCash > beforeCash || afterMiles > beforeMiles;
    });
    next = applied;
    if (gainedPricing) pricedCodes.push(code);
  }

  const pricedLegCount = next.filter((reservation) => {
    const code = reservation.confirmationCode?.trim().toUpperCase() ?? "";
    return pricedCodes.includes(code);
  }).length;

  return { reservations: next, pricedCodes, pricedLegCount };
}
