/**
 * Booked scheduled arrival clock for Home / TODAY hero copy (F3, F16).
 *
 * Canonical storage: `SessionReservation.flightArrivalTime`, populated from parser
 * `arrivalTime` at email-forward import (`email-forward/receive/route.ts`).
 * `journeyPhase.onFlight` is the same reservation object — no separate hydrator.
 */

import type { JourneyReservation } from "@/lib/travelAssistant/journeyPhase";

/** Fields inspected in order — only documented reservation keys, never notes/email. */
export const BOOKED_ARRIVAL_FIELD_KEYS = [
  "flightArrivalTime",
  /** Parser draft alias; not on SessionReservation type but may exist on legacy runtime rows. */
  "arrivalTime",
] as const;

export type BookedArrivalFieldKey = (typeof BOOKED_ARRIVAL_FIELD_KEYS)[number];

export interface ResolvedBookedArrival {
  /** Trimmed local arrival clock when stored; null when missing on the reservation. */
  value: string | null;
  /** Which key held the value, or null when all keys empty. */
  field: BookedArrivalFieldKey | null;
}

export function resolveBookedArrivalLocalTime(
  flight: JourneyReservation & Partial<Record<BookedArrivalFieldKey, string | undefined>>,
): ResolvedBookedArrival {
  for (const key of BOOKED_ARRIVAL_FIELD_KEYS) {
    const raw = flight[key];
    if (typeof raw === "string" && raw.trim()) {
      return { value: raw.trim(), field: key };
    }
  }
  return { value: null, field: null };
}

/** HH:mm or trailing clock from a stored local arrival string — no invention. */
export function formatBookedArrivalClockPart(arrivalLocal: string): string | null {
  const trimmed = arrivalLocal.trim();
  if (!trimmed) return null;
  const timePart = trimmed.includes(" ") ? trimmed.split(/\s+/u).pop() : trimmed;
  return timePart?.trim() ? timePart.trim() : null;
}

export function formatBookedArrivalDetail(
  flight: JourneyReservation & Partial<Record<BookedArrivalFieldKey, string | undefined>>,
): string | null {
  const { value } = resolveBookedArrivalLocalTime(flight);
  if (!value) return null;
  const timePart = formatBookedArrivalClockPart(value);
  return timePart ? `Scheduled arrival ${timePart}` : null;
}
