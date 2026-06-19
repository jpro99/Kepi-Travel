const PLACEHOLDER_CODES = new Set([
  "PENDING",
  "SELECTED",
  "TBD",
  "PENDING-BOOK",
  "UNKNOWN",
  "PLANNED",
]);

/** Strategy/Command Deck placeholders — not real airline/hotel confirmations. */
export function isPlaceholderConfirmation(code: string | undefined | null): boolean {
  const normalized = code?.trim().toUpperCase() ?? "";
  if (!normalized) return true;
  return PLACEHOLDER_CODES.has(normalized);
}

export function countPlaceholderReservations(
  reservations: { type: string; confirmationCode?: string | null }[],
): number {
  return reservations.filter(
    (r) => (r.type === "flight" || r.type === "hotel") && isPlaceholderConfirmation(r.confirmationCode),
  ).length;
}
