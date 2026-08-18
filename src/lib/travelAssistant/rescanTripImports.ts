import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import {
  parseForwardedEmail,
  type ForwardedReservationDraft,
} from "@/lib/travelAssistant/emailForwardParser";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";
import { resolvePricingNearBooking } from "@/lib/travelAssistant/parseReservationMiles";
import { applyAcceptedReservationPricing } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { parseAwardMilesPlusCashFromText } from "@/lib/travelAssistant/parseAwardMilesPlusCash";
import { getResendClient } from "@/lib/email/resendClient";
import { fetchReceivedEmailSourceText } from "@/lib/travelAssistant/receivedEmailPdfText";
import { shouldReplaceStoredSourceText, truncateEmailSourceText } from "@/lib/travelAssistant/emailSourceText";
import {
  isDuplicateReservation,
  type DuplicateReservationFields,
} from "@/lib/travelAssistant/reservationDuplicates";
import {
  canRescanReservation,
  groupRescannableBySource,
  mergeRescanIntoExisting,
  type RescanReservationResult,
  type RescanTripImportsResult,
} from "@/lib/travelAssistant/rescanTripImportsShared";

export type { RescanReservationResult, RescanTripImportsResult } from "@/lib/travelAssistant/rescanTripImportsShared";
export {
  canRescanReservation,
  countRescannableReservations,
  mergeRescanIntoExisting,
} from "@/lib/travelAssistant/rescanTripImportsShared";

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
  const pricing = resolvePricingNearBooking({
    notes: draft.notes,
    originalEmailText: sourceText,
    confirmationCode: draft.confirmationCode,
    title: draft.title,
    flightNumber: draft.flightNumber,
    departureAirport: draft.departureAirport,
    arrivalAirport: draft.arrivalAirport,
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
    originalEmailText: truncateEmailSourceText(sourceText),
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

function reservationNeedsPricingBackfill(reservation: SessionReservation): boolean {
  const hasCash =
    typeof reservation.quotedPriceUsd === "number" &&
    Number.isFinite(reservation.quotedPriceUsd) &&
    reservation.quotedPriceUsd > 0;
  const hasPoints =
    typeof reservation.quotedPointsMiles === "number" &&
    Number.isFinite(reservation.quotedPointsMiles) &&
    reservation.quotedPointsMiles > 0;
  if (!hasCash && !hasPoints) return true;

  const text = reservation.originalEmailText?.trim() ?? "";
  const award = text ? parseAwardMilesPlusCashFromText(text) : undefined;
  if (!award) return false;
  if (!hasPoints || !hasCash) return true;
  if (hasCash && (reservation.quotedPriceUsd ?? 0) < Math.round(award.cashUsd * 0.75)) return true;
  if (hasPoints && (reservation.quotedPointsMiles ?? 0) < Math.round(award.milesSpent * 0.75)) {
    return true;
  }
  return false;
}

async function backfillSourceTextFromResend(
  reservations: SessionReservation[],
): Promise<SessionReservation[]> {
  const resendClient = getResendClient();
  if (!resendClient) return reservations;

  const byEmailId = new Map<string, SessionReservation[]>();
  for (const reservation of reservations) {
    const emailId = reservation.sourceEmailId?.trim();
    if (!emailId || !reservationNeedsPricingBackfill(reservation)) continue;
    const list = byEmailId.get(emailId) ?? [];
    list.push(reservation);
    byEmailId.set(emailId, list);
  }
  if (byEmailId.size === 0) return reservations;

  const sourceByEmailId = new Map<string, { text: string; subject?: string }>();
  for (const emailId of byEmailId.keys()) {
    const fetched = await fetchReceivedEmailSourceText(resendClient, emailId);
    if (!fetched?.text.trim()) continue;
    sourceByEmailId.set(emailId, {
      text: fetched.text.trim(),
      subject: fetched.subject.trim() || undefined,
    });
  }
  if (sourceByEmailId.size === 0) return reservations;

  return reservations.map((reservation) => {
    const emailId = reservation.sourceEmailId?.trim();
    if (!emailId || !reservationNeedsPricingBackfill(reservation)) return reservation;
    const fetched = sourceByEmailId.get(emailId);
    if (!fetched?.text) return reservation;
    const existingText = reservation.originalEmailText?.trim() ?? "";
    if (!shouldReplaceStoredSourceText(existingText, fetched.text)) return reservation;
    return applyAcceptedReservationPricing({
      ...reservation,
      originalEmailText: truncateEmailSourceText(fetched.text),
      sourceEmailSubject: reservation.sourceEmailSubject?.trim() || fetched.subject,
    }, { reparseFromEmail: true });
  });
}

export async function rescanTripImports(
  reservations: SessionReservation[],
): Promise<RescanTripImportsResult> {
  const enrichedReservations = await backfillSourceTextFromResend(reservations);
  const groups = groupRescannableBySource(enrichedReservations);
  const skippedNoSource =
    enrichedReservations.length -
    groups.reduce((sum, group) => sum + group.reservationIds.length, 0);
  const byId = new Map(enrichedReservations.map((reservation) => [reservation.id, { ...reservation }]));
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
      const priced = applyAcceptedReservationPricing(merged.reservation, { reparseFromEmail: true });
      const filledFields = [...merged.filledFields];
      for (const key of ["quotedPriceUsd", "quotedPointsMiles", "quotedMilesEarned", "pointsProgram", "originalEmailText"] as const) {
        const before = match[key];
        const after = priced[key];
        const wasEmpty =
          before == null ||
          (typeof before === "number" && (!Number.isFinite(before) || before <= 0)) ||
          (typeof before === "string" && before.trim().length === 0);
        const nowFilled =
          after != null &&
          !((typeof after === "number" && (!Number.isFinite(after) || after <= 0)) ||
            (typeof after === "string" && after.trim().length === 0));
        if ((wasEmpty && nowFilled) || (before !== after && nowFilled)) {
          if (!filledFields.includes(key)) filledFields.push(key);
        }
      }
      byId.set(match.id, priced);
      matchedIds.add(match.id);
      results.push({
        reservationId: match.id,
        title: priced.title,
        filledFields,
        matched: true,
      });
    }
  }

  const updatedReservations = [...byId.values()].map((reservation) =>
    applyAcceptedReservationPricing(reservation, { reparseFromEmail: true }),
  );
  return {
    rescannedSources: groups.length,
    updatedReservations: results.filter((result) => result.filledFields.length > 0).length,
    skippedNoSource,
    unmatchedDrafts,
    results,
    reservations: updatedReservations,
  };
}
