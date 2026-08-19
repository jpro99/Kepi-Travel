import { shouldReplaceStoredSourceText } from "@/lib/travelAssistant/emailSourceText";
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
  const selfText = reservation.originalEmailText?.trim() ?? "";
  const donorText = donor?.originalEmailText?.trim() ?? "";

  if (donorText && shouldReplaceStoredSourceText(selfText, donorText)) {
    return {
      ...reservation,
      originalEmailText: donorText,
      sourceEmailId: reservation.sourceEmailId?.trim() || donor?.sourceEmailId,
    };
  }

  if (!selfText && donorText) {
    return {
      ...reservation,
      originalEmailText: donorText,
      sourceEmailId: reservation.sourceEmailId?.trim() || donor?.sourceEmailId,
    };
  }

  if (!reservation.sourceEmailId?.trim() && donor?.sourceEmailId?.trim()) {
    return { ...reservation, sourceEmailId: donor.sourceEmailId };
  }

  return reservation;
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

function pricingPeerGroup<T extends PricingPeerResolvable>(
  reservation: T,
  all: T[],
): T[] {
  const code = reservation.confirmationCode?.trim().toUpperCase();
  if (code) {
    const byCode = all.filter((peer) => peer.confirmationCode?.trim().toUpperCase() === code);
    if (byCode.length > 1) return byCode;
  }
  const emailId = reservation.sourceEmailId?.trim();
  if (emailId) {
    const byEmailId = all.filter((peer) => peer.sourceEmailId?.trim() === emailId);
    if (byEmailId.length > 1) return byEmailId;
  }
  return [reservation];
}

/** After per-leg hydration, copy shared cash/miles/email text across multi-leg peer groups. */
export function propagatePricingAcrossPeerGroups<T extends CashUsdResolvable & MilesResolvable & PricingPeerResolvable>(
  reservations: T[],
): T[] {
  const visitedGroupKeys = new Set<string>();
  let changed = false;
  const next = reservations.map((reservation) => ({ ...reservation }));

  for (const reservation of next) {
    const group = pricingPeerGroup(reservation, next);
    if (group.length <= 1) continue;

    const groupKey =
      reservation.confirmationCode?.trim().toUpperCase() ||
      reservation.sourceEmailId?.trim() ||
      reservation.id ||
      "";
    if (!groupKey || visitedGroupKeys.has(groupKey)) continue;
    visitedGroupKeys.add(groupKey);

    let bestText = "";
    let bestCash: number | undefined;
    let bestPoints: number | undefined;
    let bestEarned: number | undefined;
    let bestProgram: string | undefined;

    for (const peer of group) {
      const enriched = enrichReservationFromTripPeers(peer, next);
      const hydrated = hydrateReservationPricing(enriched);
      const peerText = hydrated.originalEmailText?.trim() ?? "";
      if (peerText && shouldReplaceStoredSourceText(bestText, peerText)) {
        bestText = peerText;
      }
      const cash = resolveReservationCashUsd(hydrated);
      const miles = resolveReservationMiles(hydrated);
      if (cash != null && cash > 0) bestCash = cash;
      if (miles.milesSpent != null && miles.milesSpent > 0) bestPoints = miles.milesSpent;
      if (miles.milesEarned != null && miles.milesEarned > 0) bestEarned = miles.milesEarned;
      if (miles.program?.trim()) bestProgram = miles.program.trim();
    }

    if (!bestText && bestCash == null && bestPoints == null) continue;

    for (const peer of group) {
      const index = next.findIndex((entry) => entry.id != null && entry.id === peer.id);
      if (index < 0) continue;
      const current = next[index]!;
      const patch: Partial<T> = {};
      const currentText = current.originalEmailText?.trim() ?? "";
      if (bestText && shouldReplaceStoredSourceText(currentText, bestText)) {
        patch.originalEmailText = bestText;
      }
      if (bestCash != null && (current.quotedPriceUsd == null || current.quotedPriceUsd <= 0)) {
        patch.quotedPriceUsd = bestCash;
      }
      if (bestPoints != null && (current.quotedPointsMiles == null || current.quotedPointsMiles <= 0)) {
        patch.quotedPointsMiles = bestPoints;
      }
      if (bestEarned != null && (current.quotedMilesEarned == null || current.quotedMilesEarned <= 0)) {
        patch.quotedMilesEarned = bestEarned;
      }
      if (bestProgram && !current.pointsProgram?.trim()) {
        patch.pointsProgram = bestProgram;
      }
      if (Object.keys(patch).length === 0) continue;
      next[index] = { ...current, ...patch };
      changed = true;
    }
  }

  return changed ? next : reservations;
}

export function hydrateReservationsPricing<T extends CashUsdResolvable & MilesResolvable & PricingPeerResolvable>(
  reservations: T[],
): T[] {
  let changed = false;
  const hydrated = reservations.map((reservation) => {
    const peerEnriched = enrichReservationFromTripPeers(reservation, reservations);
    const nextReservation = hydrateReservationPricing(peerEnriched);
    if (nextReservation !== reservation) changed = true;
    return nextReservation;
  });
  const propagated = propagatePricingAcrossPeerGroups(hydrated);
  if (propagated !== hydrated) changed = true;
  return changed ? propagated : reservations;
}

/** Parse email/notes and write one ticket total onto every leg in the PNR — no manual entry. */
export function finalizeTripReservationPricing<T extends CashUsdResolvable & MilesResolvable & PricingPeerResolvable>(
  reservations: T[],
): T[] {
  const repriced = reservations.map((reservation) =>
    applyAcceptedReservationPricing(
      enrichReservationFromTripPeers(reservation, reservations),
      { reparseFromEmail: true },
    ),
  );
  return hydrateReservationsPricing(repriced);
}

/** Stamp one forwarded confirmation onto every leg that shares its PNR. */
export function applyIncomingSourceToPnrGroup<T extends CashUsdResolvable & MilesResolvable & PricingPeerResolvable>(
  reservations: T[],
  incomingSourceText: string,
  confirmationCode?: string | null,
): T[] {
  const source = incomingSourceText.trim();
  if (!source) return reservations;

  const code = confirmationCode?.trim().toUpperCase();
  return reservations.map((reservation) => {
    const sameCode = Boolean(code && reservation.confirmationCode?.trim().toUpperCase() === code);
    const sameEmail = Boolean(
      reservation.originalEmailText?.trim() &&
        source.includes(reservation.originalEmailText.trim().slice(0, 80)),
    );
    if (!sameCode && !sameEmail) return reservation;
    const currentText = reservation.originalEmailText?.trim() ?? "";
    const nextText = shouldReplaceStoredSourceText(currentText, source) ? source : currentText || source;
    return applyAcceptedReservationPricing(
      { ...reservation, originalEmailText: nextText },
      { reparseFromEmail: true },
    );
  });
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
    const parsedCash = pricing.cashUsd != null && pricing.cashUsd > 0 ? pricing.cashUsd : undefined;
    const keptCash =
      hydrated.quotedPriceUsd != null && hydrated.quotedPriceUsd > 0 ? hydrated.quotedPriceUsd : undefined;
    return {
      ...hydrated,
      quotedPriceUsd: parsedCash ?? keptCash,
      quotedPointsMiles: pricing.milesSpent ?? hydrated.quotedPointsMiles,
      quotedMilesEarned: pricing.milesEarned ?? hydrated.quotedMilesEarned,
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
