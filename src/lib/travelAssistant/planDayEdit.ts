/**
 * One-day Plan editor helpers (I51 / I52) — type, paste, voice, delete, reorder.
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

/** Keep a blank row at the end so the next paste/type has a place to land. */
export function padDayActivityLines(lines: string[]): string[] {
  const next = normalizeDayActivityLines(lines);
  return next.length > 0 ? [...next, ""] : [""];
}

/** Clipboard / textarea paste becomes real day lines (I52). */
export function insertPastedDayLines(lines: string[], atIndex: number, pasted: string): string[] {
  const incoming = splitPastedDayLines(pasted);
  if (incoming.length === 0) return padDayActivityLines(lines);
  const next = [...lines];
  const index = Math.max(0, Math.min(atIndex, Math.max(next.length - 1, 0)));
  const current = (next[index] ?? "").trim();
  if (!current) {
    next.splice(index, 1, ...incoming);
  } else {
    next.splice(index + 1, 0, ...incoming);
  }
  return padDayActivityLines(next);
}

export function appendPastedDayLines(lines: string[], pasted: string): string[] {
  const incoming = splitPastedDayLines(pasted);
  if (incoming.length === 0) return padDayActivityLines(lines);
  return padDayActivityLines([...normalizeDayActivityLines(lines), ...incoming]);
}

export function moveDayActivityLine(lines: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= lines.length || to >= lines.length) {
    return lines;
  }
  const next = [...lines];
  const [item] = next.splice(from, 1);
  if (item === undefined) return lines;
  next.splice(to, 0, item);
  return next;
}
