import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";

/**
 * G27 — a Review bookings CTA is honest only when a visible surface is mounted.
 * A session flag with no sheet/drawer is a ghost (Home 2026-08-16).
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
  draft: ReviewInboxDraft;
}

export interface ReviewInboxPresentation {
  id: string;
  headline: string;
  when: string;
  where: string;
  confirmation: string;
  why: string;
  alreadyOnTrip: boolean;
  matchedTitle: string | null;
}

function formatWhen(localTime: string): string {
  const raw = localTime.trim();
  if (!raw) return "Date not parsed yet";
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

export function presentReviewInboxItem(
  item: ReviewInboxItemInput,
  liveReservations: DuplicateReservationFields[],
): ReviewInboxPresentation {
  const match = findLiveMatch(item.draft, liveReservations);
  const reasons = (item.reasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  const why = match
    ? `This looks like ${match.title?.trim() || match.provider || "a booking"} already on your trip.`
    : reasons[0] ||
      item.impact?.trim() ||
      "The parser was not sure enough to add this by itself.";

  const route =
    item.draft.flightDepartureAirport?.trim() && item.draft.flightArrivalAirport?.trim()
      ? `${item.draft.flightDepartureAirport.trim()} → ${item.draft.flightArrivalAirport.trim()}`
      : "";

  return {
    id: item.id,
    headline: item.draft.title.trim() || item.draft.provider.trim() || "Untitled booking",
    when: formatWhen(item.draft.localTime),
    where: route || item.draft.location.trim() || "Place not parsed yet",
    confirmation: item.draft.confirmationCode.trim() || "No confirmation code yet",
    why,
    alreadyOnTrip: Boolean(match),
    matchedTitle: match?.title?.trim() || match?.provider?.trim() || null,
  };
}
