import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";

/**
 * G27 — a Review bookings CTA is honest only when a visible surface is mounted.
 * A session flag with no UI is a ghost (Home 2026-08-16).
 * An empty leftover must show the original forward — not just "not parsed yet."
 */
export type ReviewCtaSurface = "none" | "session-flag-only" | "review-sheet" | "review-drawer";

export const REVIEW_INBOX_HONEST_DETAIL =
  "Check each one. Some may already be on your trip.";

export function isHonestReviewCta(input: {
  unresolvedReviewCount: number;
  surface: ReviewCtaSurface;
}): boolean {
  if (input.unresolvedReviewCount <= 0) return true;
  return input.surface === "review-sheet" || input.surface === "review-drawer";
}

export interface ReviewInboxDraft {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
}

export interface ReviewInboxItemInput {
  id: string;
  reasons?: string[];
  impact?: string;
  sourceEmailSubject?: string;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  parseConfidenceScore?: number;
  draft: ReviewInboxDraft;
}

export interface ReviewInboxPresentation {
  id: string;
  headline: string;
  when: string | null;
  where: string | null;
  confirmation: string | null;
  why: string;
  alreadyOnTrip: boolean;
  matchedTitle: string | null;
  canAddToTrip: boolean;
  sourceSubject: string | null;
  sourceBody: string | null;
  hasPdf: boolean;
  liveHints: string[];
}

function formatWhen(localTime: string): string | null {
  const raw = localTime.trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  const ms = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(ms)) return raw;
  const dateLabel = new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = raw.slice(11).trim();
  return time ? `${dateLabel} · ${time}` : dateLabel;
}

function findLiveMatch(
  draft: ReviewInboxDraft,
  liveReservations: DuplicateReservationFields[],
): DuplicateReservationFields | null {
  return liveReservations.find((reservation) => isDuplicateReservation(reservation, draft)) ?? null;
}

export function leftoverHasAddableFacts(draft: ReviewInboxDraft): boolean {
  if (draft.localTime.trim()) return true;
  if (draft.confirmationCode.trim()) return true;
  if (draft.location.trim()) return true;
  if (draft.flightDepartureAirport?.trim() && draft.flightArrivalAirport?.trim()) return true;
  if (draft.flightDate?.trim()) return true;
  return false;
}

function liveHint(reservation: DuplicateReservationFields): string {
  const title = reservation.title?.trim() || reservation.provider?.trim() || reservation.type;
  const when = formatWhen(reservation.localTime ?? "");
  return when ? `${title} · ${when}` : title;
}

export function presentReviewInboxItem(
  item: ReviewInboxItemInput,
  liveReservations: DuplicateReservationFields[],
): ReviewInboxPresentation {
  const match = findLiveMatch(item.draft, liveReservations);
  const canAddToTrip = leftoverHasAddableFacts(item.draft);
  const reasons = (item.reasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  const sourceBody = item.originalEmailText?.trim() || null;
  const sourceSubject = item.sourceEmailSubject?.trim() || null;
  const why = match
    ? `This looks like ${match.title?.trim() || match.provider || "a booking"} already on your trip.`
    : !canAddToTrip
      ? sourceBody
        ? "Kepi could not read a date, place, or confirmation. The original is below — that is what you decide from."
        : "Kepi could not read a date, place, or confirmation, and no original email was saved with this leftover."
      : reasons[0] ||
        item.impact?.trim() ||
        "The parser was not sure enough to add this by itself.";

  const route =
    item.draft.flightDepartureAirport?.trim() && item.draft.flightArrivalAirport?.trim()
      ? `${item.draft.flightDepartureAirport.trim()} → ${item.draft.flightArrivalAirport.trim()}`
      : "";

  const sameType = liveReservations.filter(
    (reservation) => reservation.type.trim().toLowerCase() === item.draft.type.trim().toLowerCase(),
  );

  return {
    id: item.id,
    headline: item.draft.title.trim() || item.draft.provider.trim() || sourceSubject || "Untitled leftover",
    when: formatWhen(item.draft.localTime),
    where: route || item.draft.location.trim() || null,
    confirmation: item.draft.confirmationCode.trim() || null,
    why,
    alreadyOnTrip: Boolean(match),
    matchedTitle: match?.title?.trim() || match?.provider?.trim() || null,
    canAddToTrip,
    sourceSubject,
    sourceBody,
    hasPdf: Boolean(item.hasPdfAttachment),
    liveHints: sameType.map(liveHint).slice(0, 4),
  };
}
