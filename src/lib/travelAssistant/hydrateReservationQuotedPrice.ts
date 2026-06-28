import {
  resolveReservationCashUsd,
  type CashUsdResolvable,
} from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  resolveReservationMiles,
  type MilesResolvable,
} from "@/lib/travelAssistant/parseReservationMiles";

export interface PricingPeerResolvable extends CashUsdResolvable {
  id?: string;
  confirmationCode?: string | null;
}

/** When multi-leg bookings share one confirmation, copy email pricing text from a sibling leg. */
export function enrichReservationFromTripPeers<T extends PricingPeerResolvable>(
  reservation: T,
  peers: T[],
): T {
  if (reservation.originalEmailText?.trim()) return reservation;
  const code = reservation.confirmationCode?.trim();
  if (!code) return reservation;

  const donor = peers.find((peer) => {
    if (peer === reservation) return false;
    if (peer.id != null && reservation.id != null && peer.id === reservation.id) return false;
    if (peer.confirmationCode?.trim() !== code) return false;
    return Boolean(peer.originalEmailText?.trim());
  });

  if (!donor?.originalEmailText?.trim()) return reservation;
  return { ...reservation, originalEmailText: donor.originalEmailText };
}

export function hydrateReservationQuotedPrice<T extends CashUsdResolvable>(reservation: T): T {
  if (
    typeof reservation.quotedPriceUsd === "number" &&
    Number.isFinite(reservation.quotedPriceUsd) &&
    reservation.quotedPriceUsd > 0
  ) {
    return reservation;
  }
  const parsed = resolveReservationCashUsd(reservation);
  if (parsed == null || parsed <= 0) return reservation;
  return { ...reservation, quotedPriceUsd: parsed };
}

export function hydrateReservationPricing<T extends CashUsdResolvable & MilesResolvable>(
  reservation: T,
): T {
  let next = hydrateReservationQuotedPrice(reservation);
  const miles = resolveReservationMiles(next);

  const patch: Partial<MilesResolvable> = {};
  if (
    (next.quotedPointsMiles == null || next.quotedPointsMiles <= 0) &&
    miles.milesSpent != null
  ) {
    patch.quotedPointsMiles = miles.milesSpent;
  }
  if (
    (next.quotedMilesEarned == null || next.quotedMilesEarned <= 0) &&
    miles.milesEarned != null
  ) {
    patch.quotedMilesEarned = miles.milesEarned;
  }
  if (!next.pointsProgram?.trim() && miles.program) {
    patch.pointsProgram = miles.program;
  }

  if (Object.keys(patch).length === 0) return next;
  return { ...next, ...patch };
}

export function hydrateReservationsQuotedPrices<T extends CashUsdResolvable>(reservations: T[]): T[] {
  let changed = false;
  const next = reservations.map((reservation) => {
    const hydrated = hydrateReservationQuotedPrice(reservation);
    if (hydrated !== reservation) changed = true;
    return hydrated;
  });
  return changed ? next : reservations;
}

export function hydrateReservationsPricing<T extends CashUsdResolvable & MilesResolvable & PricingPeerResolvable>(
  reservations: T[],
): T[] {
  let changed = false;
  const next = reservations.map((reservation) => {
    const peerEnriched = enrichReservationFromTripPeers(reservation, reservations);
    const hydrated = hydrateReservationPricing(peerEnriched);
    if (hydrated !== reservation) changed = true;
    return hydrated;
  });
  return changed ? next : reservations;
}

/** Normalize cash + miles fields when accepting a review item or saving a reservation. */
export function applyAcceptedReservationPricing<T extends CashUsdResolvable & MilesResolvable>(
  draft: T,
  context?: { originalEmailText?: string },
): T {
  const merged = {
    ...draft,
    originalEmailText: context?.originalEmailText?.trim() || draft.originalEmailText,
  };
  const hydrated = hydrateReservationPricing(merged);
  const cashUsd = resolveReservationCashUsd(hydrated);
  const miles = resolveReservationMiles(hydrated);
  return {
    ...hydrated,
    quotedPriceUsd: cashUsd != null && cashUsd > 0 ? cashUsd : undefined,
    quotedPointsMiles: miles.milesSpent,
    quotedMilesEarned: miles.milesEarned,
    pointsProgram: miles.program ?? hydrated.pointsProgram,
  };
}
