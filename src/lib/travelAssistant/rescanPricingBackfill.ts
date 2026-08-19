import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { PDF_ATTACHMENT_MARKER } from "@/lib/travelAssistant/emailSourceText";
import { parseAwardMilesPlusCashFromText } from "@/lib/travelAssistant/parseAwardMilesPlusCash";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { resolveReservationMiles } from "@/lib/travelAssistant/parseReservationMiles";

function reservationNeedsPdfBackfill(reservation: SessionReservation): boolean {
  if (reservation.type !== "flight") return false;
  const text = reservation.originalEmailText?.trim() ?? "";
  if (!text) return Boolean(reservation.sourceEmailId?.trim());
  return !text.includes(PDF_ATTACHMENT_MARKER);
}

/** True when stored or parsed pricing is incomplete and Resend/PDF re-fetch may help. */
export function reservationNeedsPricingBackfill(reservation: SessionReservation): boolean {
  const resolvedCash = resolveReservationCashUsd(reservation);
  const resolvedMiles = resolveReservationMiles(reservation);
  const hasResolvedCash = resolvedCash != null && resolvedCash > 0;
  const hasResolvedPoints =
    resolvedMiles.milesSpent != null && resolvedMiles.milesSpent > 0;

  if (!hasResolvedCash && !hasResolvedPoints) return true;

  if (!hasResolvedCash && reservationNeedsPdfBackfill(reservation)) return true;

  const hasStoredCash =
    typeof reservation.quotedPriceUsd === "number" &&
    Number.isFinite(reservation.quotedPriceUsd) &&
    reservation.quotedPriceUsd > 0;
  const hasStoredPoints =
    typeof reservation.quotedPointsMiles === "number" &&
    Number.isFinite(reservation.quotedPointsMiles) &&
    reservation.quotedPointsMiles > 0;

  const text = reservation.originalEmailText?.trim() ?? "";
  const award = text ? parseAwardMilesPlusCashFromText(text) : undefined;
  if (!award) return false;
  if (!hasStoredPoints || !hasStoredCash) return true;
  if (hasStoredCash && (reservation.quotedPriceUsd ?? 0) < Math.round(award.cashUsd * 0.75)) return true;
  if (hasStoredCash && (reservation.quotedPriceUsd ?? 0) > Math.round(award.cashUsd * 4)) return true;
  if (hasStoredCash && hasStoredPoints && reservation.quotedPriceUsd === reservation.quotedPointsMiles) {
    return true;
  }
  if (hasStoredPoints && (reservation.quotedPointsMiles ?? 0) < Math.round(award.milesSpent * 0.75)) {
    return true;
  }
  return false;
}
