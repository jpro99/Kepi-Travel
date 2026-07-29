/**
 * Remap hotel check-in/out into the active trip window by month/day (I35).
 * Same class of bug as I27 day-plan years (2025 Polignano → Europe 2026).
 */

import { dateOnly, remapDayKeyIntoTripWindow } from "@/lib/travelAssistant/tripWindow";
import { correctReservationTravelDates } from "@/lib/travelAssistant/travelDateCorrection";
import { reconcileTripWindowDates } from "@/lib/travelAssistant/tripWindowRepair";

export interface HotelDateRepairFields {
  type?: string;
  localTime?: string;
  checkOutDate?: string;
  notes?: string;
}

function extractCheckoutFromNotes(notes: string): string {
  if (!notes?.trim()) return "";
  const patterns = [
    /check[\s-]?out\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/iu,
    /check[\s-]?out[^\n]{0,80}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/iu,
    /check[\s-]?out[^\n]{0,80}?(\d{1,2}\/\d{1,2}\/\d{2,4})/iu,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (!match?.[1]) continue;
    const raw = match[1].trim();
    if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw;
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
}

/**
 * Remap a hotel's check-in/out into tripStart…tripEnd by month/day when the year is wrong.
 * Also fills missing checkOutDate from notes when possible.
 */
export function remapHotelDatesIntoTripWindow<T extends HotelDateRepairFields>(
  reservation: T,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): T {
  if ((reservation.type ?? "").toLowerCase() !== "hotel") return reservation;

  let next: T = { ...reservation };

  // First roll obviously past years forward (2025 → 2026 in July 2026).
  next = correctReservationTravelDates(next);

  // Never remap into a stale past trip window — bump the window first (I37).
  const bounds = reconcileTripWindowDates(tripStartDate, tripEndDate, [
    next.localTime,
    next.checkOutDate,
  ]);
  const start = bounds.startDate;
  const end = bounds.endDate;

  if (!start || !end) return next;

  const checkInRaw = dateOnly(next.localTime);
  if (checkInRaw) {
    const remappedIn = remapDayKeyIntoTripWindow(checkInRaw, start, end);
    if (remappedIn && remappedIn !== checkInRaw) {
      const timePart = (next.localTime ?? "").trim().slice(10);
      next = {
        ...next,
        localTime: `${remappedIn}${timePart || " 15:00"}`,
      };
    }
  }

  let checkOut = dateOnly(next.checkOutDate) || extractCheckoutFromNotes(next.notes ?? "");
  if (checkOut) {
    const remappedOut = remapDayKeyIntoTripWindow(checkOut, start, end);
    if (remappedOut) checkOut = remappedOut;
    // Checkout must be after check-in; if remap collapsed order, bump checkout year.
    const checkIn = dateOnly(next.localTime);
    if (checkIn && checkOut <= checkIn) {
      const bumped = remapDayKeyIntoTripWindow(checkOut, checkIn, end);
      if (bumped && bumped > checkIn) checkOut = bumped;
    }
    next = { ...next, checkOutDate: checkOut };
  }

  return next;
}

export function reconcileStoredHotelReservations<T extends HotelDateRepairFields & { id?: string }>(
  reservations: T[],
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): { reservations: T[]; changed: boolean } {
  let changed = false;
  const next = reservations.map((reservation) => {
    if ((reservation.type ?? "").toLowerCase() !== "hotel") return reservation;
    const beforeIn = dateOnly(reservation.localTime);
    const beforeOut = dateOnly(reservation.checkOutDate);
    const repaired = remapHotelDatesIntoTripWindow(reservation, tripStartDate, tripEndDate);
    if (dateOnly(repaired.localTime) !== beforeIn || dateOnly(repaired.checkOutDate) !== beforeOut) {
      changed = true;
      return repaired;
    }
    return reservation;
  });
  return { reservations: next, changed };
}

/** Sleep-night coverage: check-in ≤ night < check-out (checkout morning is not a stay night). */
export function hotelCoversSleepNight(
  hotel: { localTime?: string; checkOutDate?: string; notes?: string },
  nightKey: string,
): boolean {
  const checkIn = dateOnly(hotel.localTime);
  const checkOut =
    dateOnly(hotel.checkOutDate) || extractCheckoutFromNotes(hotel.notes ?? "");
  if (!checkIn || !checkOut) return false;
  return checkIn <= nightKey && nightKey < checkOut;
}
