import { resolveReservationCashUsd, type CashUsdResolvable } from "@/lib/travelAssistant/parseReservationCashUsd";

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

export function hydrateReservationsQuotedPrices<T extends CashUsdResolvable>(reservations: T[]): T[] {
  let changed = false;
  const next = reservations.map((reservation) => {
    const hydrated = hydrateReservationQuotedPrice(reservation);
    if (hydrated !== reservation) changed = true;
    return hydrated;
  });
  return changed ? next : reservations;
}
