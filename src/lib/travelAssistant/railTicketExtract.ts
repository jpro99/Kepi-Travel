/**
 * I58 — Italian / European rail PDFs put the truth on the page (DD/MM/YYYY,
 * station names, binario). The flight-shaped parser treated 13/09/2026 as
 * month 13 and dropped the ticket. Read those facts; do not ghost an empty leftover.
 */

export interface RailTicketFacts {
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  timezone: string;
  notes: string;
}

const ITALIAN_RAIL_RE =
  /\b(?:trenitalia|italo|ntv|frecciarossa|frecciargento|frecciabianca|intercity|regionale|partenza|arrivo|binario|stazione|venezia\s+s\.?\s*lucia|biglietto)\b/iu;

const RAIL_WORD_RE = /\b(?:train|rail|amtrak|platform|trenitalia|italo)\b/iu;

export function isRailTicketText(text: string): boolean {
  return ITALIAN_RAIL_RE.test(text) || RAIL_WORD_RE.test(text);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 13/09/2026 is 13 September, never month 13. Ambiguous 05/09 uses day-first for rail. */
export function parseRailSlashDate(raw: string, preferDayFirst = true): string | null {
  const match = raw
    .trim()
    .match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/u);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  let day = first;
  let month = second;
  if (first > 12 && second <= 12) {
    day = first;
    month = second;
  } else if (second > 12 && first <= 12) {
    month = first;
    day = second;
  } else if (!preferDayFirst) {
    month = first;
    day = second;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020 || year > 2035) {
    return null;
  }
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

function parseRailTime(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[:.](\d{2})$/u);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function cleanStation(value: string): string {
  return value
    .replace(/\b(?:partenza|arrivo|departure|arrival|from|to|binario|platform|bin\.?|trenitalia|italo|ntv|ticket|biglietto)\b/giu, "")
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gu, "")
    .replace(/\d{1,2}[:.]\d{2}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.,;:]+$/u, "");
}

function findConfirmation(text: string): string {
  const patterns = [
    /\bcodice\s+prenotazione\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\bcodice\s+biglietto\s*[:#]?\s*([A-Z0-9]{6,14})\b/iu,
    /\bpnr\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\bbooking\s*(?:ref(?:erence)?|code)\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\bconfirmation\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return "";
}

function findProvider(text: string): string {
  if (/\bitalo\b/iu.test(text)) return "Italo";
  if (/\b(?:trenitalia|frecciarossa|frecciargento|frecciabianca)\b/iu.test(text)) return "Trenitalia";
  if (/\bamtrak\b/iu.test(text)) return "Amtrak";
  return "";
}

function findKnownStations(text: string): { from: string; to: string } | null {
  const stationPattern =
    /\b(Lecce|Bari|Brindisi|Monopoli|Polignano|Roma\s+Termini|Roma\s+Tiburtina|Milano\s+Centrale|Firenze\s+S\.?\s*M\.?\s*N\.?|Napoli\s+Centrale|Venezia\s+S\.?\s*Lucia|Venezia\s+Mestre|Verona\s+P\.?\s*ta\s+Nuova|Bologna\s+Centrale|Torino\s+P\.?\s*ta\s+Nuova)\b/giu;
  const timed: Array<{ station: string; minutes: number }> = [];
  for (const match of text.matchAll(stationPattern)) {
    const station = cleanStation(match[0] ?? "");
    if (!station) continue;
    const window = text.slice(Math.max(0, match.index ?? 0), (match.index ?? 0) + 80);
    const time = window.match(/\b(\d{1,2})[:.](\d{2})\b/u);
    const minutes = time ? Number(time[1]) * 60 + Number(time[2]) : Number.POSITIVE_INFINITY;
    timed.push({ station, minutes });
  }
  if (timed.length >= 2) {
    const sorted = [...timed].sort((a, b) => a.minutes - b.minutes);
    const from = sorted[0]?.station ?? "";
    const to = sorted[sorted.length - 1]?.station ?? "";
    if (from && to && from.toLowerCase() !== to.toLowerCase()) return { from, to };
  }
  return null;
}

function findStations(text: string): { from: string; to: string } | null {
  const known = findKnownStations(text);
  if (known) return known;

  const partenza = text.match(
    /(?:partenza|departure|from)\s*[:\s]*\n+\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{2,50})/iu,
  );
  const arrivo = text.match(
    /(?:arrivo|arrival|to)\s*[:\s]*\n+\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{2,50})/iu,
  );
  if (partenza?.[1] && arrivo?.[1]) {
    const from = cleanStation(partenza[1]);
    const to = cleanStation(arrivo[1]);
    if (from.length >= 3 && to.length >= 3) return { from, to };
  }

  const arrow = text.match(
    /([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{1,40}?)\s*(?:→|->|—|–|verso)\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{1,40})/u,
  );
  if (arrow?.[1] && arrow[2]) {
    const from = cleanStation(arrow[1]);
    const to = cleanStation(arrow[2]);
    if (from.length >= 3 && to.length >= 3) return { from, to };
  }
  return null;
}

function findDepartureLocalTime(text: string): string | null {
  const labeled = text.match(
    /(?:partenza|departure|dep\.?)\s*[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s+(\d{1,2}[:.]\d{2})/iu,
  );
  if (labeled?.[1] && labeled[2]) {
    const day = parseRailSlashDate(labeled[1], true);
    const time = parseRailTime(labeled[2]);
    if (day && time) return `${day} ${time}`;
  }

  const dateMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/u);
  const day = dateMatch?.[1] ? parseRailSlashDate(dateMatch[1], true) : null;
  const times = [...text.matchAll(/\b(\d{1,2}[:.]\d{2})\b/gu)]
    .map((match) => parseRailTime(match[1] ?? ""))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (day && times[0]) return `${day} ${times[0]}`;
  if (day) return `${day} 12:00`;
  return null;
}

function findPlatformNote(text: string): string {
  const match = text.match(/\b(?:binario|platform|bin\.?)\s*[:#]?\s*(\d{1,2}[A-Z]?)\b/iu);
  return match?.[1] ? `Platform ${match[1]}` : "";
}

export function extractRailTicketFacts(text: string, subject = ""): RailTicketFacts | null {
  const combined = `${subject}\n${text}`.replace(/\r/gu, "");
  if (!isRailTicketText(combined)) return null;

  const stations = findStations(combined);
  const localTime = findDepartureLocalTime(combined);
  const confirmationCode = findConfirmation(combined);
  const provider = findProvider(combined);
  const notes = findPlatformNote(combined);
  if (!stations && !localTime && !confirmationCode) return null;

  const location = stations ? `${stations.from} → ${stations.to}` : "";
  const title = location || cleanStation(subject) || "Train";

  return {
    title,
    provider,
    localTime: localTime ?? "",
    location,
    confirmationCode,
    timezone: ITALIAN_RAIL_RE.test(combined) ? "Europe/Rome" : "",
    notes,
  };
}
