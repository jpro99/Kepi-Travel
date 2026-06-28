import {
  resolveReservationCashUsd,
  type CashUsdResolvable,
} from "@/lib/travelAssistant/parseReservationCashUsd";
import {
  resolveReservationMiles,
  type MilesResolvable,
} from "@/lib/travelAssistant/parseReservationMiles";

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

export function hydrateReservationsPricing<T extends CashUsdResolvable & MilesResolvable>(
  reservations: T[],
): T[] {
  let changed = false;
  const next = reservations.map((reservation) => {
    const hydrated = hydrateReservationPricing(reservation);
    if (hydrated !== reservation) changed = true;
    return hydrated;
  });
  return changed ? next : reservations;
}
