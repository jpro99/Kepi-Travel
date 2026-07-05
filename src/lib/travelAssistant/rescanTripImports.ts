import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import {
  parseForwardedEmail,
  type ForwardedReservationDraft,
} from "@/lib/travelAssistant/emailForwardParser";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";
import { resolveReservationPricing } from "@/lib/travelAssistant/parseReservationMiles";
import {
  isDuplicateReservation,
  type DuplicateReservationFields,
} from "@/lib/travelAssistant/reservationDuplicates";
import { mergeReservationPricingFields } from "@/lib/travelAssistant/tripEmailAttach";

const MIN_SOURCE_CHARS = 80;

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
  return source.length >= MIN_SOURCE_CHARS;
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

function draftToMatchFields(draft: ForwardedReservationDraft): DuplicateReservationFields {
  return {
    type: draft.type,
    provider: draft.provider,
    localTime: draft.localTime,
    location: draft.location,
    confirmationCode: draft.confirmationCode,
    flightNumber: draft.flightNumber,
    flightDepartureAirport: draft.departureAirport,
    flightArrivalAirport: draft.arrivalAirport,
  };
}

function draftToIncomingReservation(
  draft: ForwardedReservationDraft,
  sourceText: string,
  subject?: string,
): Partial<SessionReservation> {
  const prepared = prepareReviewDraftForAccept({
    type: draft.type,
    title: draft.title,
    provider: draft.provider,
    localTime: draft.localTime,
    timezone: draft.timezone,
    location: draft.location,
    confirmationCode: draft.confirmationCode,
    flightNumber: draft.flightNumber,
    flightAirline: draft.provider,
    flightDate: draft.localTime.slice(0, 10),
    flightDepartureAirport: draft.departureAirport,
    flightArrivalAirport: draft.arrivalAirport,
    flightDepartureTime: draft.type === "flight" ? draft.localTime : undefined,
  });
  const enriched = enrichReservationForAutoImport({
    ...prepared,
    notes: draft.notes,
    checkOutDate: draft.checkOutDate,
  });
  const pricing = resolveReservationPricing({
    notes: draft.notes,
    originalEmailText: sourceText,
  });

  return {
    type: draft.type as SessionReservation["type"],
    title: enriched.title,
    provider: enriched.provider,
    localTime: enriched.localTime,
    timezone: enriched.timezone,
    location: enriched.location,
    confirmationCode: enriched.confirmationCode,
    notes: enriched.notes ?? draft.notes,
    flightNumber: enriched.flightNumber,
    flightAirline: enriched.flightAirline,
    flightDate: enriched.flightDate,
    flightDepartureAirport: enriched.flightDepartureAirport,
    flightArrivalAirport: enriched.flightArrivalAirport,
    flightDepartureTime: enriched.flightDepartureTime,
    checkOutDate: enriched.checkOutDate ?? draft.checkOutDate,
    quotedPriceUsd: pricing.cashUsd,
    quotedPointsMiles: pricing.milesSpent,
    quotedMilesEarned: pricing.milesEarned,
    pointsProgram: pricing.program,
    sourceEmailSubject: subject,
    originalEmailText: sourceText.slice(0, 12_000),
  };
}

function findMatchingReservation(
  reservations: SessionReservation[],
  draft: ForwardedReservationDraft,
  matchedIds: Set<string>,
): SessionReservation | null {
  const fields = draftToMatchFields(draft);
  const byLeg = reservations.find(
    (reservation) => !matchedIds.has(reservation.id) && isDuplicateReservation(reservation, fields),
  );
  if (byLeg) return byLeg;

  const code = draft.confirmationCode?.trim().toUpperCase() ?? "";
  if (code && !isPlaceholderConfirmation(code)) {
    const byCode = reservations.find(
      (reservation) =>
        !matchedIds.has(reservation.id) &&
        reservation.type === draft.type &&
        reservation.confirmationCode?.trim().toUpperCase() === code,
    );
    if (byCode) return byCode;
  }

  return null;
}

function groupRescannableBySource(
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

export async function rescanTripImports(
  reservations: SessionReservation[],
): Promise<RescanTripImportsResult> {
  const groups = groupRescannableBySource(reservations);
  const skippedNoSource = reservations.length - groups.reduce((sum, group) => sum + group.reservationIds.length, 0);
  const byId = new Map(reservations.map((reservation) => [reservation.id, { ...reservation }]));
  const results: RescanReservationResult[] = [];
  const matchedIds = new Set<string>();
  let unmatchedDrafts = 0;

  for (const group of groups) {
    const parsed = await parseForwardedEmail({
      subject: group.subject ?? "Imported confirmation",
      text: group.sourceText,
    });

    const drafts = parsed.drafts.length > 0 ? parsed.drafts : [parsed.draft];
    for (const draft of drafts) {
      const liveReservations = [...byId.values()];
      const match = findMatchingReservation(liveReservations, draft, matchedIds);
      if (!match) {
        unmatchedDrafts += 1;
        continue;
      }

      const incoming = draftToIncomingReservation(draft, group.sourceText, group.subject);
      const merged = mergeRescanIntoExisting(match, incoming);
      byId.set(match.id, merged.reservation);
      matchedIds.add(match.id);
      results.push({
        reservationId: match.id,
        title: merged.reservation.title,
        filledFields: merged.filledFields,
        matched: true,
      });
    }
  }

  const updatedReservations = [...byId.values()];
  return {
    rescannedSources: groups.length,
    updatedReservations: results.filter((result) => result.filledFields.length > 0).length,
    skippedNoSource,
    unmatchedDrafts,
    results,
    reservations: updatedReservations,
  };
}
