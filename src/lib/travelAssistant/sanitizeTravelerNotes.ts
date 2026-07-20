/** Strip internal parser jargon travelers should never see. */

const PHRASE_SCRUBS: RegExp[] = [
  /\s*Applied AI fallback extraction for low-confidence fields\.?\s*/giu,
  /\s*AI fallback skipped:[^.]*\.?\s*/giu,
];

const INTERNAL_NOTE_PATTERNS: RegExp[] = [
  /^\s*Applied AI fallback extraction for low-confidence fields\.?\s*$/iu,
  /^\s*AI fallback skipped:.*$/iu,
  /^\s*Time not found in email; defaulted to 12:00.*$/iu,
];

export function sanitizeTravelerNoteLine(line: string): string | null {
  let trimmed = line.trim();
  if (!trimmed) return null;
  for (const scrub of PHRASE_SCRUBS) {
    trimmed = trimmed.replace(scrub, " ").replace(/\s+/gu, " ").trim();
  }
  if (!trimmed) return null;
  for (const pattern of INTERNAL_NOTE_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  return trimmed;
}

export function sanitizeTravelerNotes(notes: string | undefined | null): string {
  if (!notes?.trim()) return "";
  return notes
    .split(/\r?\n/u)
    .map((line) => sanitizeTravelerNoteLine(line))
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
