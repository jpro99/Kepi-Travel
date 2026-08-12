/**
 * Consumer More / empty Home / Plan chrome: Lucide + light Apple cards.
 * G21 — no emoji section headers, no navy empty-trip cockpit.
 */

export const CONSUMER_SECTION_KEYS = [
  "points",
  "trips",
  "fit",
  "cards",
  "loyalty",
  "packing",
  "family",
  "bug",
  "trash",
  "refresh",
] as const;

export type ConsumerSectionKey = (typeof CONSUMER_SECTION_KEYS)[number];

/** Light empty-Home card — never `from-slate-900 via-blue-950`. */
export const EMPTY_HOME_CARD_CLASS =
  "rounded-3xl overflow-hidden bg-[#F5F5F7] shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08]";

export function emptyHomeUsesNavyCockpit(): boolean {
  return false;
}

/** Emoji banned as consumer More / empty Home / Plan section chrome. */
export const CONSUMER_CHROME_EMOJI =
  /📚|🎯|🗂️|💡|🐛|👨‍👩‍👧|🗑|🎒|✨|💳|🔄/;
