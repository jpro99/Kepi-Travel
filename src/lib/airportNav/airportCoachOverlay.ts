/**
 * Coach-only overlay facts — never map pins (BRAIN A1 Sunday method 2026-08-30).
 */

/** FCO arrivals: EU Entry/Exit System border time — ADR network notice 2025-10. */
export const FCO_EES_ARRIVAL_COACH_DETAIL =
  "EU Entry/Exit System (EES) at the border can add extra minutes the first time you register fingerprints and face — follow passport lane signage; not a kiosk pin on this map.";

/**
 * Port of Seattle official checkpoint wait text when the booking/app already has it.
 * Returns undefined when missing — never invent wait times.
 */
export function seaPortCheckpointWaitCoachDetail(
  officialWaitText: string | null | undefined,
): string | undefined {
  const text = officialWaitText?.trim();
  if (!text) return undefined;
  return `${text} — Port of Seattle live checkpoint wait. Pick your checkpoint; Kepi does not invent per-lane times.`;
}
