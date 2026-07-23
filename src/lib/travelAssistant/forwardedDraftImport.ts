const BOOKING_TYPES = new Set(["flight", "hotel", "train", "ride", "dinner"]);

/** Review reason when a parsed draft falls outside the active trip date window. */
export const OUT_OF_WINDOW_REVIEW_REASON =
  "Outside active trip dates — confirm which trip this belongs to.";

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasBookingDateSignal(record: Record<string, unknown>): boolean {
  const localTime = readString(record, "localTime");
  if (/^\d{4}-\d{2}-\d{2}/u.test(localTime)) return true;
  const flightDate = readString(record, "flightDate");
  if (/^\d{4}-\d{2}-\d{2}/u.test(flightDate)) return true;
  const checkOutDate = readString(record, "checkOutDate");
  return /^\d{4}-\d{2}-\d{2}/u.test(checkOutDate);
}

/** True when a parser draft looks like a real booking, not day-plan narrative junk. */
export function isBookingShapedParserDraft(record: Record<string, unknown>): boolean {
  const type = readString(record, "type").toLowerCase();
  if (!BOOKING_TYPES.has(type)) return false;

  const confirmationCode = readString(record, "confirmationCode");
  const flightNumber = readString(record, "flightNumber") || readString(record, "flight_number");
  if (confirmationCode || flightNumber) return true;

  if (!hasBookingDateSignal(record)) return false;

  const location = readString(record, "location");
  if (type === "hotel" || type === "flight" || type === "train") {
    return location.length > 0;
  }

  return true;
}

/**
 * Day-plan forwards still import booking-shaped drafts from the same email/Word doc.
 * Non-booking parser noise is skipped when a narrative day plan is also detected.
 */
export function selectDraftsToImport(
  parserDraftRecords: Record<string, unknown>[],
  isDayPlanForward: boolean,
): Record<string, unknown>[] {
  if (!isDayPlanForward) return parserDraftRecords;
  return parserDraftRecords.filter(isBookingShapedParserDraft);
}
