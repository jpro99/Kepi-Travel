import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";
import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";

export const DRAIN_DUPLICATE_REVIEW_REASON = "Already on your trip — duplicate skipped.";

export interface DrainableReviewItem {
  id: string;
  /** Explicit reasons a human should look at this before it becomes trip fact. */
  reasons?: string[];
  /** When set, only `auto-parsed` email/gmail items without reasons may auto-promote (F9). */
  parsingStatus?: "auto-parsed" | "needs-review" | "needs-user-input";
  draft: DuplicateReservationFields & {
    type: string;
    title: string;
    timezone: string;
    confirmationCode: string;
    notes?: string;
    flightAirline?: string;
    flightDate?: string;
    flightDepartureTime?: string;
    flightArrivalTime?: string;
    checkOutDate?: string;
    assignedTo?: string[];
    stage?: string;
    critical?: boolean;
    confidence?: string;
  };
  sourceChannel?: "email-forward" | "gmail-import" | "manual";
  sourceEmailSubject?: string;
  sourceEmailId?: string;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  manageUrl?: string;
}

export interface DrainableReservation extends DuplicateReservationFields {
  id: string;
  type: string;
  title: string;
  timezone: string;
  confirmationCode: string;
  source?: string;
  notes?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  checkOutDate?: string;
  assignedTo?: string[];
  stage?: string;
  critical?: boolean;
  confidence?: string;
  sourceEmailSubject?: string;
  sourceEmailId?: string;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  manageUrl?: string;
}

function isAutoImportReviewItem(item: DrainableReviewItem): boolean {
  // Anything the parser or plausibility gate flagged with an explicit reason must stay
  // in the queue for a human to confirm — never silently promote it to trip fact.
  if (Array.isArray(item.reasons) && item.reasons.length > 0) {
    return false;
  }
  // F9: default-deny for email/gmail unless explicitly auto-parsed.
  // Legacy/malformed rows without parsingStatus stay in the queue.
  if (item.sourceChannel === "email-forward" || item.sourceChannel === "gmail-import") {
    return item.parsingStatus === "auto-parsed";
  }
  return false;
}

/**
 * Move forwarded/import review items into live reservations — but only when they carry
 * no explicit review reason and parsingStatus is auto-parsed (see `isAutoImportReviewItem`).
 * Items with `reasons` (from `evaluateForwardedReservationGate`) require an explicit
 * human confirm step and are left untouched in the queue.
 */
export interface DrainPromotedReservation {
  id: string;
  type: string;
  title: string;
  confirmationCode: string;
}

export function drainForwardReviewQueue<TReservation extends DrainableReservation>(
  reservations: TReservation[],
  reviewQueue: DrainableReviewItem[],
  createId: () => string,
): {
  reservations: TReservation[];
  reviewQueue: DrainableReviewItem[];
  changed: boolean;
  promoted: DrainPromotedReservation[];
} {
  if (reviewQueue.length === 0) {
    return { reservations, reviewQueue, changed: false, promoted: [] };
  }

  let nextReservations = [...reservations];
  const remainingQueue: DrainableReviewItem[] = [];
  const promoted: DrainPromotedReservation[] = [];
  let changed = false;

  for (const item of reviewQueue) {
    if (!isAutoImportReviewItem(item)) {
      remainingQueue.push(item);
      continue;
    }

    const enriched = enrichReservationForAutoImport(
      prepareReviewDraftForAccept({
        ...item.draft,
        type: item.draft.type,
        title: item.draft.title ?? "",
        provider: item.draft.provider ?? "",
        localTime: item.draft.localTime ?? "",
        timezone: item.draft.timezone ?? "Etc/UTC",
        location: item.draft.location ?? "",
        confirmationCode: item.draft.confirmationCode ?? "",
        notes: item.draft.notes,
        flightNumber: item.draft.flightNumber,
        flightAirline: item.draft.flightAirline,
        flightDate: item.draft.flightDate,
        flightDepartureAirport: item.draft.flightDepartureAirport,
        flightArrivalAirport: item.draft.flightArrivalAirport,
        flightDepartureTime: item.draft.flightDepartureTime,
        flightArrivalTime: item.draft.flightArrivalTime,
        // Hotels: checkout must survive drain or Stay Gaps invent phantom holes (I35).
        checkOutDate: item.draft.checkOutDate,
      }),
    );

    if (nextReservations.some((reservation) => isDuplicateReservation(reservation, enriched))) {
      // F10: keep the review item visible with an explicit reason — never silent-delete.
      const existingReasons = Array.isArray(item.reasons) ? item.reasons : [];
      const nextReasons = existingReasons.includes(DRAIN_DUPLICATE_REVIEW_REASON)
        ? existingReasons
        : [...existingReasons, DRAIN_DUPLICATE_REVIEW_REASON];
      remainingQueue.push({
        ...item,
        reasons: nextReasons,
      });
      changed = true;
      continue;
    }

    const id = createId();
    const imported = {
      ...enriched,
      id,
      source: "imported",
      sourceEmailSubject: item.sourceEmailSubject,
      sourceEmailId: item.sourceEmailId,
      originalEmailText: item.originalEmailText,
      hasPdfAttachment: item.hasPdfAttachment,
      manageUrl: item.manageUrl,
      flightNumber: enriched.flightNumber ?? "",
      flightAirline: enriched.flightAirline ?? enriched.provider,
      flightDate: enriched.flightDate ?? enriched.localTime.slice(0, 10),
      flightDepartureAirport: enriched.flightDepartureAirport ?? "",
      flightArrivalAirport: enriched.flightArrivalAirport ?? "",
      flightDepartureTime: enriched.flightDepartureTime ?? enriched.localTime,
      flightArrivalTime: enriched.flightArrivalTime,
      checkOutDate: enriched.checkOutDate,
      notes: enriched.notes,
    } as TReservation;

    nextReservations = [imported, ...nextReservations];
    promoted.push({
      id,
      type: enriched.type,
      title: enriched.title?.trim() || enriched.provider?.trim() || "Booking",
      confirmationCode: enriched.confirmationCode?.trim() || "",
    });
    changed = true;
  }

  if (!changed) {
    return { reservations, reviewQueue, changed: false, promoted: [] };
  }

  return {
    reservations: nextReservations,
    reviewQueue: remainingQueue,
    changed: true,
    promoted,
  };
}
