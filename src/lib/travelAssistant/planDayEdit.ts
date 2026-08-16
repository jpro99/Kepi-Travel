/**
 * One-day Plan editor helpers (I51) — type, paste, voice, delete for a single date.
 */

export function splitPastedDayLines(text: string): string[] {
  return text
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-\*▪◦]\s*/u, "").trim())
    .filter(Boolean);
}

export function normalizeDayActivityLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

export function dayActivityLinesEqual(left: string[], right: string[]): boolean {
  const a = normalizeDayActivityLines(left);
  const b = normalizeDayActivityLines(right);
  if (a.length !== b.length) return false;
  return a.every((line, index) => line === b[index]);
}

export function planDayEditorTitle(heading: string, location?: string | null): string {
  const day = heading.trim();
  const city = location?.trim() ?? "";
  if (day && city && !day.toLowerCase().includes(city.toLowerCase())) {
    return `${day} · ${city}`;
  }
  return day || city || "This day";
}
