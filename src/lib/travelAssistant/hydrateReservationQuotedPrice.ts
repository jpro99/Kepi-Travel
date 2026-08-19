import {
  isImplausibleSingleBookingCash,
  isMilesQuantityMisreadAsCash,
  resolveReservationCashUsd,
  type CashUsdResolvable,
} from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  resolveReservationMiles,
  resolveReservationPricing,
  type MilesResolvable,
  type ReservationPricing,
} from "@/lib/travelAssistant/parseReservationMiles";

export interface PricingPeerResolvable extends CashUsdResolvable {
  id?: string;
  confirmationCode?: string | null;
  sourceEmailId?: string;
}

function findPricingDonor<T extends PricingPeerResolvable>(
  reservation: T,
  peers: T[],
): T | undefined {
  const code = reservation.confirmationCode?.trim();
  if (code) {
    const byCode = peers.find((peer) => {
      if (peer === reservation) return false;
      if (peer.id != null && reservation.id != null && peer.id === reservation.id) return false;
      if (peer.confirmationCode?.trim() !== code) return false;
      return Boolean(peer.originalEmailText?.trim());
    });
    if (byCode) return byCode;
  }

  const emailId = reservation.sourceEmailId?.trim();
  if (emailId) {
    return peers.find((peer) => {
      if (peer === reservation) return false;
      if (peer.id != null && reservation.id != null && peer.id === reservation.id) return false;
      if (peer.sourceEmailId?.trim() !== emailId) return false;
      return Boolean(peer.originalEmailText?.trim());
    });
  }

  return undefined;
}

/** When multi-leg bookings share one confirmation, copy email pricing text from a sibling leg. */
export function enrichReservationFromTripPeers<T extends PricingPeerResolvable>(
  reservation: T,
  peers: T[],
): T {
  const donor = findPricingDonor(reservation, peers);

  if (reservation.originalEmailText?.trim()) {
    if (reservation.sourceEmailId?.trim() || !donor?.sourceEmailId?.trim()) {
      return reservation;
    }
    return { ...reservation, sourceEmailId: donor.sourceEmailId };
  }

  if (!donor?.originalEmailText?.trim()) return reservation;
  return {
    ...reservation,
    originalEmailText: donor.originalEmailText,
    sourceEmailId: reservation.sourceEmailId?.trim() || donor.sourceEmailId,
  };
}

export interface ApplyPricingOptions {
  originalEmailText?: string;
  /** When true (default for import/rescan), email source wins over stale stored quoted fields. */
  reparseFromEmail?: boolean;
}

/** Parse pricing from email/notes — source of truth for forwarded confirmations. */
export function resolvePricingFromEmailSource(
  reservation: CashUsdResolvable & MilesResolvable,
): ReservationPricing {
  return resolveReservationPricing(reservation);
}

export function hydrateReservationQuotedPrice<T extends CashUsdResolvable>(reservation: T): T {
  const parsed = resolveReservationCashUsd(reservation);
  if (parsed != null && parsed > 0) {
    if (reservation.quotedPriceUsd === parsed) return reservation;
    return { ...reservation, quotedPriceUsd: parsed };
  }
  const stored = reservation.quotedPriceUsd;
  if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) {
    const miles =
      typeof reservation.quotedPointsMiles === "number" && reservation.quotedPointsMiles > 0
        ? reservation.quotedPointsMiles
        : undefined;
    if (isImplausibleSingleBookingCash(stored) || isMilesQuantityMisreadAsCash(stored, miles)) {
      return { ...reservation, quotedPriceUsd: undefined };
    }
  }
  return reservation;
}

export function hydrateReservationPricing<T extends CashUsdResolvable & MilesResolvable>(
  reservation: T,
): T {
  let next = hydrateReservationQuotedPrice(reservation);
  const miles = resolveReservationMiles(next);

  const patch: Partial<MilesResolvable> = {};
  if (miles.milesSpent != null) {
    patch.quotedPointsMiles = miles.milesSpent;
  }
  if (miles.milesEarned != null) {
    patch.quotedMilesEarned = miles.milesEarned;
  }
  if (miles.program) {
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
  context?: ApplyPricingOptions,
): T {
  const merged = {
    ...draft,
    originalEmailText: context?.originalEmailText?.trim() || draft.originalEmailText,
  };

  const reparseFromEmail = context?.reparseFromEmail !== false;
  const hasEmailSource = Boolean(merged.originalEmailText?.trim());

  if (reparseFromEmail && hasEmailSource) {
    const hydrated = hydrateReservationPricing(merged);
    const pricing = resolvePricingFromEmailSource(hydrated);
    return {
      ...hydrated,
      quotedPriceUsd: pricing.cashUsd != null && pricing.cashUsd > 0 ? pricing.cashUsd : undefined,
      quotedPointsMiles: pricing.milesSpent,
      quotedMilesEarned: pricing.milesEarned,
      pointsProgram: pricing.program ?? hydrated.pointsProgram,
    };
  }

  const hydrated = hydrateReservationPricing(merged);
  const pricing = resolvePricingFromEmailSource(hydrated);
  return {
    ...hydrated,
    quotedPriceUsd:
      hydrated.quotedPriceUsd != null && hydrated.quotedPriceUsd > 0
        ? hydrated.quotedPriceUsd
        : pricing.cashUsd != null && pricing.cashUsd > 0
          ? pricing.cashUsd
          : undefined,
    quotedPointsMiles:
      hydrated.quotedPointsMiles != null && hydrated.quotedPointsMiles > 0
        ? hydrated.quotedPointsMiles
        : pricing.milesSpent,
    quotedMilesEarned:
      hydrated.quotedMilesEarned != null && hydrated.quotedMilesEarned > 0
        ? hydrated.quotedMilesEarned
        : pricing.milesEarned,
    pointsProgram: hydrated.pointsProgram?.trim() || pricing.program,
  };
}
