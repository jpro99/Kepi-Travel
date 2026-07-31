/**
 * Policy helpers for email-forward live mutation vs review queue (F6 / F11).
 */

export const PROPOSED_UPDATE_REVIEW_IMPACT =
  "Proposed update to an existing booking — confirm before it changes your trip.";

export const UNKNOWN_TYPE_REVIEW_REASON =
  "Unknown reservation type — confirm what this is.";

const KNOWN_RESERVATION_TYPES = new Set(["flight", "hotel", "train", "ride", "dinner"]);

/** True when the parser type is one Kepi can auto-import without human type pick. */
export function isKnownReservationType(rawType: unknown): boolean {
  return typeof rawType === "string" && KNOWN_RESERVATION_TYPES.has(rawType);
}

/**
 * F6: never mutate live trip (planned replace / flight merge / pricing merge)
 * when the forwarded draft failed the trust gate.
 */
export function canMutateLiveFromForward(gateNeedsReview: boolean): boolean {
  return !gateNeedsReview;
}
