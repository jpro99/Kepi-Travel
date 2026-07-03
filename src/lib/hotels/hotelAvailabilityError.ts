/** User-facing copy when LiteAPI prebook/checkout fails. */
export function normalizeHotelAvailabilityError(raw?: string | null): string {
  const message = raw?.trim() ?? "";
  if (!message) {
    return "This rate is no longer available for your dates. Try another hotel or check Google Hotels.";
  }

  const lower = message.toLowerCase();
  if (/sold.?out|no longer available|not available|unavailable|no availability|no rooms|allotment/.test(lower)) {
    return "Sold out or no longer available for these dates through Kepi. Try another hotel or open Google Hotels.";
  }
  if (/expired|invalid offer|offer.?not found|rate.?not found/.test(lower)) {
    return "This search rate expired — run the search again, then book quickly on a Live in Kepi hotel.";
  }
  if (/prebook failed|could not verify/.test(lower)) {
    return message;
  }

  return message;
}

export function isHotelSoldOutError(raw?: string | null): boolean {
  const lower = raw?.trim().toLowerCase() ?? "";
  return /sold.?out|no longer available|not available|unavailable|no availability|no rooms|allotment/.test(lower);
}
