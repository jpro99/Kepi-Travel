import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";
import { extractRailTicketFacts } from "@/lib/travelAssistant/railTicketExtract";

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

function stationTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/u)
    .filter((part) => part.length >= 4);
}

function trainHopOverlap(reservation: DuplicateReservationFields, draft: ReviewInboxDraft): boolean {
  if (reservation.type.trim().toLowerCase() !== "train" || draft.type.trim().toLowerCase() !== "train") {
    return false;
  }
  const reservationDay = (reservation.localTime ?? "").slice(0, 10);
  const draftDay = draft.localTime.slice(0, 10);
  if (!reservationDay || reservationDay !== draftDay) return false;
  const live = new Set(stationTokens(`${reservation.location} ${reservation.title ?? ""}`));
  return stationTokens(`${draft.location} ${draft.title}`).some((token) => live.has(token));
}

function findLiveMatch(
  draft: ReviewInboxDraft,
  liveReservations: DuplicateReservationFields[],
): DuplicateReservationFields | null {
  return (
    liveReservations.find((reservation) => isDuplicateReservation(reservation, draft)) ??
    liveReservations.find((reservation) => trainHopOverlap(reservation, draft)) ??
    null
  );
}

export function enrichReviewInboxItemFromSource(item: ReviewInboxItemInput): ReviewInboxItemInput {
  if (leftoverHasAddableFacts(item.draft)) return item;
  const facts = extractRailTicketFacts(item.originalEmailText ?? "", item.sourceEmailSubject ?? "");
  if (!facts) return item;
  return {
    ...item,
    draft: {
      ...item.draft,
      type: item.draft.type || "train",
      title: facts.title || item.draft.title,
      provider: facts.provider || item.draft.provider,
      localTime: facts.localTime || item.draft.localTime,
      location: facts.location || item.draft.location,
      confirmationCode: facts.confirmationCode || item.draft.confirmationCode,
    },
  };
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
  const enriched = enrichReviewInboxItemFromSource(item);
  const draft = enriched.draft;
  const match = findLiveMatch(draft, liveReservations);
  const canAddToTrip = leftoverHasAddableFacts(draft);
  const didEnrich =
    draft.localTime.trim() !== item.draft.localTime.trim() ||
    draft.location.trim() !== item.draft.location.trim();
  const reasons = (item.reasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  const sourceBody = item.originalEmailText?.trim() || null;
  const sourceSubject = item.sourceEmailSubject?.trim() || null;
  const why = match
    ? `This looks like ${match.title?.trim() || match.provider || "a booking"} already on your trip.`
    : didEnrich
      ? "Read from the original ticket below."
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
    (reservation) => reservation.type.trim().toLowerCase() === (draft.type || item.draft.type).trim().toLowerCase(),
  );

  return {
    id: item.id,
    headline: draft.title.trim() || draft.provider.trim() || sourceSubject || "Untitled leftover",
    when: formatWhen(draft.localTime),
    where: route || draft.location.trim() || null,
    confirmation: draft.confirmationCode.trim() || null,
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
