import { isDuplicateReservation, type DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";
import { extractRailTicketFacts } from "@/lib/travelAssistant/railTicketExtract";
import {
  extractActivityTicketFacts,
  isGarbageConfirmationCode,
  isLegalBoilerplateText,
  stripLegalBoilerplate,
} from "@/lib/travelAssistant/activityTicketExtract";

/**
 * G27 — a Review bookings CTA is honest only when a visible surface is mounted.
 * A session flag with no UI is a ghost (Home 2026-08-16).
 * An empty leftover must show the original forward — not just "not parsed yet."
 * G28 — do not ask anyone to add GetYourGuide legal terms. Match the booking ID.
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
  sourceKind: "booking" | "legal-terms" | "empty";
  hasPdf: boolean;
  liveHints: string[];
  autoResolve: "already-on-trip" | "legal-terms" | null;
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

function confirmationOverlap(reservation: DuplicateReservationFields, draft: ReviewInboxDraft): boolean {
  const draftCode = draft.confirmationCode.trim().toLowerCase();
  if (!draftCode || isGarbageConfirmationCode(draftCode)) return false;
  const hay = [
    reservation.confirmationCode ?? "",
    reservation.title ?? "",
    reservation.provider ?? "",
    reservation.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(draftCode);
}

function findLiveMatch(
  draft: ReviewInboxDraft,
  liveReservations: DuplicateReservationFields[],
): DuplicateReservationFields | null {
  return (
    liveReservations.find((reservation) => isDuplicateReservation(reservation, draft)) ??
    liveReservations.find((reservation) => confirmationOverlap(reservation, draft)) ??
    liveReservations.find((reservation) => trainHopOverlap(reservation, draft)) ??
    null
  );
}

export function leftoverHasAddableFacts(draft: ReviewInboxDraft, sourceText = ""): boolean {
  const code = draft.confirmationCode.trim();
  const usableCode = code && !isGarbageConfirmationCode(code);
  if (sourceText && isLegalBoilerplateText(sourceText) && !draft.localTime.trim() && !draft.location.trim()) {
    return false;
  }
  if (draft.localTime.trim()) return true;
  if (usableCode && draft.location.trim()) return true;
  if (draft.location.trim()) return true;
  if (draft.flightDepartureAirport?.trim() && draft.flightArrivalAirport?.trim()) return true;
  if (draft.flightDate?.trim()) return true;
  return false;
}

export function enrichReviewInboxItemFromSource(item: ReviewInboxItemInput): ReviewInboxItemInput {
  const source = `${item.sourceEmailSubject ?? ""}\n${item.originalEmailText ?? ""}`;
  const activity = extractActivityTicketFacts(item.originalEmailText ?? "", item.sourceEmailSubject ?? "");
  const rail = extractRailTicketFacts(item.originalEmailText ?? "", item.sourceEmailSubject ?? "");
  let draft = { ...item.draft };
  if (isGarbageConfirmationCode(draft.confirmationCode)) {
    draft = { ...draft, confirmationCode: "" };
  }
  if (activity) {
    const subjectTitle = /^fwd:/iu.test(draft.title.trim()) || draft.title.trim().length > 48;
    draft = {
      ...draft,
      type: "dinner",
      title: subjectTitle || !draft.title.trim() ? activity.title : draft.title,
      provider: activity.provider || draft.provider,
      confirmationCode: activity.confirmationCode || draft.confirmationCode,
    };
  } else if (rail && !leftoverHasAddableFacts(draft, source)) {
    draft = {
      ...draft,
      type: draft.type || "train",
      title: rail.title || draft.title,
      provider: rail.provider || draft.provider,
      localTime: rail.localTime || draft.localTime,
      location: rail.location || draft.location,
      confirmationCode: rail.confirmationCode || draft.confirmationCode,
    };
  }
  return { ...item, draft };
}

function liveHint(reservation: DuplicateReservationFields): string {
  const title = reservation.title?.trim() || reservation.provider?.trim() || reservation.type;
  const when = formatWhen(reservation.localTime ?? "");
  return when ? `${title} · ${when}` : title;
}

function relevantLiveHints(
  draft: ReviewInboxDraft,
  liveReservations: DuplicateReservationFields[],
  match: DuplicateReservationFields | null,
): string[] {
  if (match) return [liveHint(match)];
  const type = (draft.type || "").trim().toLowerCase();
  return liveReservations
    .filter((reservation) => reservation.type.trim().toLowerCase() === type)
    .map(liveHint)
    .slice(0, 3);
}

export function shouldAutoResolveReviewLeftover(
  presented: Pick<ReviewInboxPresentation, "alreadyOnTrip" | "canAddToTrip" | "sourceKind">,
): boolean {
  if (presented.alreadyOnTrip) return true;
  if (presented.sourceKind === "legal-terms" && !presented.canAddToTrip) return true;
  return false;
}

export function presentReviewInboxItem(
  item: ReviewInboxItemInput,
  liveReservations: DuplicateReservationFields[],
): ReviewInboxPresentation {
  const enriched = enrichReviewInboxItemFromSource(item);
  const draft = enriched.draft;
  const match = findLiveMatch(draft, liveReservations);
  const rawSource = item.originalEmailText?.trim() || "";
  const legalOnly = rawSource ? isLegalBoilerplateText(rawSource) : false;
  const canAddToTrip = leftoverHasAddableFacts(draft, rawSource);
  const didEnrich =
    draft.localTime.trim() !== item.draft.localTime.trim() ||
    draft.location.trim() !== item.draft.location.trim() ||
    draft.confirmationCode.trim() !== item.draft.confirmationCode.trim();
  const reasons = (item.reasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  const sourceSubject = item.sourceEmailSubject?.trim() || null;
  const stripped = rawSource ? stripLegalBoilerplate(rawSource) : "";
  const sourceKind: ReviewInboxPresentation["sourceKind"] = !rawSource
    ? "empty"
    : legalOnly
      ? "legal-terms"
      : "booking";
  const sourceBody =
    sourceKind === "legal-terms"
      ? null
      : stripped
        ? stripped.slice(0, 800)
        : rawSource.slice(0, 800) || null;

  const why = match
    ? `This booking is already on your trip (${match.title?.trim() || match.provider || "saved booking"}). You do not need to add it again.`
    : sourceKind === "legal-terms"
      ? draft.confirmationCode
        ? `This PDF is ticket terms, not the tour. Booking ${draft.confirmationCode} is the confirmation — Kepi will not add a legal notice to your trip.`
        : "This PDF is ticket terms, not a booking. Forwarding it does not add Privacy Policy text to your trip."
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
    item.draft.flightDepartureAirport?.trim() && item.draft.flightArrivalAirport?.trim() && draft.type === "flight"
      ? `${item.draft.flightDepartureAirport.trim()} → ${item.draft.flightArrivalAirport.trim()}`
      : "";

  const alreadyOnTrip = Boolean(match);
  const autoResolve = shouldAutoResolveReviewLeftover({
    alreadyOnTrip,
    canAddToTrip,
    sourceKind,
  })
    ? alreadyOnTrip
      ? "already-on-trip"
      : "legal-terms"
    : null;

  return {
    id: item.id,
    headline: draft.title.trim() || draft.provider.trim() || sourceSubject || "Untitled leftover",
    when: formatWhen(draft.localTime),
    where: route || draft.location.trim() || null,
    confirmation: draft.confirmationCode.trim() || null,
    why,
    alreadyOnTrip,
    matchedTitle: match?.title?.trim() || match?.provider?.trim() || null,
    canAddToTrip: canAddToTrip && !alreadyOnTrip,
    sourceSubject,
    sourceBody,
    sourceKind,
    hasPdf: Boolean(item.hasPdfAttachment),
    liveHints: relevantLiveHints(draft, liveReservations, match),
    autoResolve,
  };
}
