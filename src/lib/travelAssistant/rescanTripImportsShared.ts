import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { mergeReservationPricingFields } from "@/lib/travelAssistant/reservationPricingMerge";

export const MIN_RESCAN_SOURCE_CHARS = 80;

const RESCAN_FILLABLE_KEYS = [
  "title",
  "provider",
  "localTime",
  "timezone",
  "location",
  "confirmationCode",
  "flightNumber",
  "flightAirline",
  "flightDate",
  "flightDepartureAirport",
  "flightArrivalAirport",
  "flightDepartureTime",
  "flightArrivalTime",
  "flightDepartureGate",
  "flightDepartureTerminal",
  "flightArrivalGate",
  "flightArrivalTerminal",
  "checkOutDate",
  "roomType",
  "hotelPhone",
  "manageUrl",
] as const satisfies ReadonlyArray<keyof SessionReservation>;

type RescanFillableKey = (typeof RESCAN_FILLABLE_KEYS)[number];

export interface RescanReservationResult {
  reservationId: string;
  title: string;
  filledFields: string[];
  matched: boolean;
}

export interface RescanTripImportsResult {
  rescannedSources: number;
  updatedReservations: number;
  skippedNoSource: number;
  unmatchedDrafts: number;
  results: RescanReservationResult[];
  reservations: SessionReservation[];
}

export function canRescanReservation(reservation: SessionReservation): boolean {
  const source = reservation.originalEmailText?.trim() ?? "";
  return source.length >= MIN_RESCAN_SOURCE_CHARS;
}

export function countRescannableReservations(reservations: SessionReservation[]): number {
  return reservations.filter(canRescanReservation).length;
}

function isEmptyPricingField(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function isEmptyRescanValue(key: RescanFillableKey, value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (key === "confirmationCode" && isPlaceholderConfirmation(trimmed)) return true;
  if (key === "provider") {
    const lower = trimmed.toLowerCase();
    if (["unknown", "airline", "hotel", "imported", "tbd"].includes(lower)) return true;
  }
  if (key === "title" && ["flight", "hotel stay", "imported flight"].includes(trimmed.toLowerCase())) {
    return true;
  }
  return false;
}

export function mergeRescanIntoExisting(
  existing: SessionReservation,
  incoming: Partial<SessionReservation>,
): { reservation: SessionReservation; filledFields: string[] } {
  const filledFields: string[] = [];
  const next: SessionReservation = { ...existing };

  for (const key of RESCAN_FILLABLE_KEYS) {
    const existingValue = existing[key];
    const incomingValue = incoming[key];
    if (isEmptyRescanValue(key, existingValue) && !isEmptyRescanValue(key, incomingValue)) {
      Object.assign(next, { [key]: incomingValue });
      filledFields.push(key);
    }
  }

  const priced = mergeReservationPricingFields(next, incoming as SessionReservation);
  const pricingKeys = ["quotedPriceUsd", "quotedPointsMiles", "quotedMilesEarned", "pointsProgram"] as const;
  for (const key of pricingKeys) {
    const wasEmpty = isEmptyPricingField(existing[key]);
    const nowFilled = !isEmptyPricingField(priced[key]);
    if (wasEmpty && nowFilled && !filledFields.includes(key)) {
      filledFields.push(key);
    }
  }

  return { reservation: priced, filledFields };
}

export function groupRescannableBySource(
  reservations: SessionReservation[],
): Array<{ sourceText: string; subject?: string; reservationIds: string[] }> {
  const groups = new Map<string, { sourceText: string; subject?: string; reservationIds: string[] }>();
  for (const reservation of reservations) {
    if (!canRescanReservation(reservation)) continue;
    const sourceText = reservation.originalEmailText?.trim() ?? "";
    const key = sourceText;
    const existing = groups.get(key);
    if (existing) {
      existing.reservationIds.push(reservation.id);
      if (!existing.subject && reservation.sourceEmailSubject?.trim()) {
        existing.subject = reservation.sourceEmailSubject.trim();
      }
      continue;
    }
    groups.set(key, {
      sourceText,
      subject: reservation.sourceEmailSubject?.trim() || undefined,
      reservationIds: [reservation.id],
    });
  }
  return [...groups.values()];
}
