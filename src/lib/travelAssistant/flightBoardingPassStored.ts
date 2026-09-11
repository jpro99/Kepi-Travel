/**
 * Detect stored in-app boarding-pass artifacts — any IATA / any airline.
 */

import { isOpenableTicketUrl } from "@/lib/travelAssistant/trainTicketHandoff";
import type { ReservationSourceLink } from "@/lib/travelAssistant/reservationLinks";
import { isBookedFlightReservation } from "@/lib/travelAssistant/travelDayFlightView";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";

export interface StoredBoardingPassFields {
  sourceLinks?: ReservationSourceLink[];
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  boardingPassUrl?: string;
}

export interface FlightBoardingPassSourceReservation extends HomeStayReservation, StoredBoardingPassFields {}

function isStoredInAppUrl(url: string): boolean {
  return url.trim().startsWith("/");
}

function isPerLegBoardingPassLink(link: ReservationSourceLink): boolean {
  if (link.kind !== "ticket" || !link.url?.trim()) return false;
  if (!isOpenableTicketUrl(link.url)) return false;
  try {
    const leg = new URL(link.url, "https://kepitravel.com").searchParams.get("leg");
    return Boolean(leg?.trim());
  } catch {
    return false;
  }
}

/** True when Kepi holds per-leg boarding-pass artifacts (named PDF / source-view). */
export function reservationHasStoredBoardingPassArtifacts(
  reservation: StoredBoardingPassFields,
): boolean {
  if (reservation.hasPdfAttachment && reservation.originalEmailText?.includes("--- PDF:")) {
    return true;
  }
  const boardingPass = reservation.boardingPassUrl?.trim();
  if (boardingPass && isOpenableTicketUrl(boardingPass) && isStoredInAppUrl(boardingPass)) {
    return true;
  }
  return (reservation.sourceLinks ?? []).some(isPerLegBoardingPassLink);
}

export function flightReservationsWithStoredBoardingPasses(
  reservations: readonly FlightBoardingPassSourceReservation[],
): FlightBoardingPassSourceReservation[] {
  return reservations.filter(
    (row) => isBookedFlightReservation(row) && reservationHasStoredBoardingPassArtifacts(row),
  );
}
