/** G27/G71 — forwarded flight banner must open a visible surface; low-confidence needs editor. */

export function forwardedFlightReviewNeedsEditor(input: {
  draft: {
    type: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDepartureTime?: string;
    localTime?: string;
  };
  parsingStatus?: string;
  parseConfidenceScore?: number;
  reasons?: string[];
}): boolean {
  if (input.draft.type !== "flight") return false;
  if (input.parsingStatus === "needs-user-input") return true;
  if ((input.parseConfidenceScore ?? 100) < 40) return true;
  if (!input.draft.flightDepartureAirport?.trim() || !input.draft.flightArrivalAirport?.trim()) {
    return true;
  }
  const depTime = input.draft.flightDepartureTime?.trim() || input.draft.localTime?.trim();
  if (!depTime || depTime.length < 10) return true;
  if (
    input.reasons?.some((reason) =>
      /missing departure airport|missing arrival airport|departure time|low parsing confidence/i.test(reason),
    )
  ) {
    return true;
  }
  return false;
}
