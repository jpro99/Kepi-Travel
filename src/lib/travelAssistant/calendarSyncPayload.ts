import type { UpdatableReservationType } from "@/lib/travelAssistant/travelUpdateTypes";

export type CalendarSyncReservationPayload = {
  id: string;
  type: UpdatableReservationType;
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
  provider?: string;
  notes?: string;
};

/** G30 — skip incomplete bookings; never fail the whole batch for one bad row. */
export function isReservationCalendarSyncReady(reservation: {
  title?: string;
  localTime?: string;
  location?: string;
}): boolean {
  return Boolean(reservation.title?.trim() && reservation.localTime?.trim() && reservation.location?.trim());
}

export function toCalendarSyncReservationPayload(reservation: {
  id: string;
  type: UpdatableReservationType;
  title: string;
  confirmationCode?: string;
  localTime: string;
  location: string;
  timezone: string;
  provider?: string;
  notes?: string;
}): CalendarSyncReservationPayload {
  return {
    id: reservation.id,
    type: reservation.type,
    title: reservation.title.trim(),
    confirmationCode: reservation.confirmationCode?.trim() || reservation.id,
    localTime: reservation.localTime.trim(),
    location: reservation.location.trim(),
    timezone: reservation.timezone?.trim() || "Etc/UTC",
    provider: reservation.provider?.trim() || undefined,
    notes: reservation.notes?.trim() || undefined,
  };
}

export function filterCalendarSyncReservations<
  T extends {
    id: string;
    title?: string;
    localTime?: string;
    location?: string;
  },
>(reservations: readonly T[], reservationIds?: readonly string[]): T[] {
  const idFilter =
    reservationIds && reservationIds.length > 0 ? new Set(reservationIds) : null;
  return reservations.filter(
    (reservation) =>
      (!idFilter || idFilter.has(reservation.id)) && isReservationCalendarSyncReady(reservation),
  );
}

/** Background retry schedule — calm, no toast spam. */
export const CALENDAR_SYNC_BACKGROUND_RETRY_MS = [5_000, 30_000, 120_000] as const;

export function shouldRetryCalendarSyncResponse(status: number): boolean {
  return status >= 500 || status === 429;
}
