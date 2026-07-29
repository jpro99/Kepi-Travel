import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";
import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";

export interface DrainableReviewItem {
  id: string;
  /** Explicit reasons a human should look at this before it becomes trip fact. */
  reasons?: string[];
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
  if (item.sourceChannel === "email-forward" || item.sourceChannel === "gmail-import") {
    return true;
  }
  const subject = item.sourceEmailSubject?.trim() ?? "";
  return subject.length > 0;
}

/**
 * Move forwarded/import review items into live reservations — but only when they carry
 * no explicit review reason (see `isAutoImportReviewItem`). Items with `reasons` (from
 * `evaluateForwardedReservationGate`) require an explicit human confirm step and are
 * left untouched in the queue.
 */
export function drainForwardReviewQueue<TReservation extends DrainableReservation>(
  reservations: TReservation[],
  reviewQueue: DrainableReviewItem[],
  createId: () => string,
): { reservations: TReservation[]; reviewQueue: DrainableReviewItem[]; changed: boolean } {
  if (reviewQueue.length === 0) {
    return { reservations, reviewQueue, changed: false };
  }

  let nextReservations = [...reservations];
  const remainingQueue: DrainableReviewItem[] = [];
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
      changed = true;
      continue;
    }

    const imported = {
      ...enriched,
      id: createId(),
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
    changed = true;
  }

  if (!changed) {
    return { reservations, reviewQueue, changed: false };
  }

  return {
    reservations: nextReservations,
    reviewQueue: remainingQueue,
    changed: true,
  };
}
