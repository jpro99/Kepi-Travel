import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";

export interface ConsumerTimelineReservation {
  type: string;
  provider?: string;
  notes?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
}

/** Onboarding demo rows — never part of the consumer-facing itinerary. */
export function isOnboardingSetupPlaceholder(reservation: ConsumerTimelineReservation): boolean {
  const provider = (reservation.provider ?? "").trim().toLowerCase();
  const notes = (reservation.notes ?? "").trim().toLowerCase();
  return provider === "onboarding setup" || notes.includes("created during onboarding");
}

/** True when a reservation should appear on the consumer timeline (real bookings only). */
export function isConsumerTimelineReservation(reservation: ConsumerTimelineReservation): boolean {
  if (isOnboardingSetupPlaceholder(reservation)) return false;
  if (isPlannedReservation(reservation)) return false;
  return true;
}

export function filterConsumerTimelineReservations<T extends ConsumerTimelineReservation>(
  reservations: T[],
): T[] {
  return reservations.filter(isConsumerTimelineReservation);
}
