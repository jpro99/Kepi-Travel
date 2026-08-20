import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import {
  parseForwardedEmail,
  type ForwardedReservationDraft,
} from "@/lib/travelAssistant/emailForwardParser";
import {
  isSpendTrackedReservation,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";
import { resolvePricingNearBooking } from "@/lib/travelAssistant/parseReservationMiles";
import { applyAcceptedReservationPricing, finalizeTripReservationPricing, hydrateReservationsPricing } from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { getResendClient } from "@/lib/email/resendClient";
import { fetchReceivedEmailSourceText } from "@/lib/travelAssistant/receivedEmailPdfText";
import { reservationNeedsPricingBackfill } from "@/lib/travelAssistant/rescanPricingBackfill";
import { sweepInboxForMissingPrices } from "@/lib/travelAssistant/inboxPricingSweep";
import { sweepGmailForMissingPrices } from "@/lib/travelAssistant/gmailPricingSweep";
import { buildPricingDiagnostics } from "@/lib/travelAssistant/pricingDiagnostics";
import {
  shouldReplaceStoredSourceText,
  truncateEmailSourceText,
} from "@/lib/travelAssistant/emailSourceText";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
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
export { reservationNeedsPricingBackfill } from "@/lib/travelAssistant/rescanPricingBackfill";

function countPricingResolved(
  before: SessionReservation[],
  after: SessionReservation[],
): number {
  const trackedAfter = after.filter(isSpendTrackedReservation);
  let count = 0;
  for (const reservation of trackedAfter) {
    if (reservationMissingPrice(reservation, trackedAfter)) continue;
    const previous = before.find((entry) => entry.id === reservation.id);
    if (previous && reservationMissingPrice(previous, before)) {
      count += 1;
    }
  }
  return count;
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
    if (!emailId) return reservation;
    const fetched = sourceByEmailId.get(emailId);
    if (!fetched?.text) return reservation;
    const existingText = reservation.originalEmailText?.trim() ?? "";
    if (!shouldReplaceStoredSourceText(existingText, fetched.text)) return reservation;
    return applyAcceptedReservationPricing(
      {
        ...reservation,
        originalEmailText: truncateEmailSourceText(fetched.text),
        sourceEmailSubject: reservation.sourceEmailSubject?.trim() || fetched.subject,
      },
      { reparseFromEmail: true },
    );
  });
}

export async function rescanTripImports(
  reservations: SessionReservation[],
  options?: { userId?: string },
): Promise<RescanTripImportsResult> {
  const beforeReservations = reservations.map((reservation) => ({ ...reservation }));
  let enrichedReservations = await backfillSourceTextFromResend(reservations);

  // G39 — when a fare is still missing, hunt the whole Kepi inbox for its receipt.
  const sweepClient = getResendClient();
  if (sweepClient) {
    try {
      const swept = await sweepInboxForMissingPrices(sweepClient, enrichedReservations);
      enrichedReservations = swept.reservations;
    } catch {
      // Sweep is best-effort; re-scan continues with stored sources.
    }
  }

  // G40 — still missing? Search the traveler's own Gmail, PDFs included.
  let gmailConnected = true;
  if (options?.userId) {
    try {
      const gmailSwept = await sweepGmailForMissingPrices(options.userId, enrichedReservations);
      enrichedReservations = gmailSwept.reservations;
      gmailConnected = gmailSwept.gmailAvailable;
    } catch {
      // Gmail sweep is best-effort.
    }
  }
  let workingReservations = hydrateReservationsPricing(
    enrichedReservations.map((reservation) =>
      applyAcceptedReservationPricing(reservation, { reparseFromEmail: true }),
    ),
  );
  const groups = groupRescannableBySource(workingReservations);
  const skippedNoSource =
    workingReservations.length -
    groups.reduce((sum, group) => sum + group.reservationIds.length, 0);
  const byId = new Map(workingReservations.map((reservation) => [reservation.id, { ...reservation }]));
  const results: RescanReservationResult[] = [];
  const matchedIds = new Set<string>();
  let unmatchedDrafts = 0;

  for (const group of groups) {
    let parsed: Awaited<ReturnType<typeof parseForwardedEmail>>;
    try {
      parsed = await parseForwardedEmail({
        subject: group.subject ?? "Imported confirmation",
        text: group.sourceText,
      });
    } catch {
      unmatchedDrafts += 1;
      continue;
    }

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

  const updatedReservations = finalizeTripReservationPricing(
    [...byId.values()].map((reservation) =>
      applyAcceptedReservationPricing(reservation, { reparseFromEmail: true }),
    ),
  );
  const pricingUpdatedCount = countPricingResolved(beforeReservations, updatedReservations);
  const fieldUpdateCount = results.filter((result) => result.filledFields.length > 0).length;
  return {
    rescannedSources: groups.length,
    updatedReservations: Math.max(fieldUpdateCount, pricingUpdatedCount),
    pricingUpdatedCount,
    skippedNoSource,
    unmatchedDrafts,
    results,
    reservations: updatedReservations,
    pricingDiagnostics: buildPricingDiagnostics(updatedReservations),
    gmailConnected,
  };
}
