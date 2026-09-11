/**
 * I58 — Italian / European rail PDFs put the truth on the page (DD/MM/YYYY,
 * station names, binario). The flight-shaped parser treated 13/09/2026 as
 * month 13 and dropped the ticket. Read those facts; do not ghost an empty leftover.
 */

export interface RailTicketFacts {
  title: string;
  provider: string;
  trainNumber: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  timezone: string;
  notes: string;
}

export interface RailPassengerFacts {
  name: string;
  ticketNumber: string;
  coachSeat: string;
}

const ITALIAN_RAIL_RE =
  /\b(?:trenitalia|italo|ntv|frecciarossa|frecciargento|frecciabianca|intercity|regionale|partenza|arrivo|binario|stazione|venezia\s+s\.?\s*lucia|biglietto)\b/iu;

const RAIL_WORD_RE = /\b(?:train|rail|amtrak|platform|trenitalia|italo)\b/iu;

const TRAIN_SERVICE_FIND_RE =
  /\b(Frecciargento|Frecciarossa|Frecciabianca|Regionale(?:\s+Veloce)?|Intercity|InterCity)\s+(\d{4,5})\b/iu;

const TRAIN_SERVICE_SPLIT_RE =
  /\b(Frecciargento|Frecciarossa|Frecciabianca|Regionale(?:\s+Veloce)?|Intercity|InterCity)\s+(\d{4,5})\b/giu;

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
    .replace(/\b(?:partenza|arrivo|departure|arrival|from|to|binario|platform|bin\.?|trenitalia|italo|ntv|ticket|biglietto|passeggero|passenger)\b/giu, "")
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gu, "")
    .replace(/\d{1,2}[:.]\d{2}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.,;:]+$/u, "");
}

function normalizeStationLabel(raw: string): string {
  const trimmed = cleanStation(raw);
  if (/^BARI\s+C\.?LE(?:\s+FNB)?$/iu.test(trimmed)) return "Bari Centrale FNB";
  if (/^BARI\s+AEROPORTO/iu.test(trimmed)) return "Bari Aeroporto";
  if (/^Bari\s+Centrale$/iu.test(trimmed)) return "Bari Centrale";
  return trimmed;
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
    /\b(Lecce|Bari Centrale|BARI C\.?LE(?:\s+FNB)?|BARI AEROPORTO(?:\s+KAROL\s+WOJTYLA)?|Bari|Brindisi|Monopoli|Polignano|Roma\s+Termini|Roma\s+Tiburtina|Milano\s+Centrale|Firenze\s+S\.?\s*M\.?\s*N\.?|Napoli\s+Centrale|Venezia\s+S\.?\s*Lucia|Venezia\s+Mestre|Verona\s+P\.?\s*ta\s+Nuova|Bologna\s+Centrale|Torino\s+P\.?\s*ta\s+Nuova)\b/giu;
  const timed: Array<{ station: string; minutes: number }> = [];
  for (const match of text.matchAll(stationPattern)) {
    const station = normalizeStationLabel(match[0] ?? "");
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
    const from = normalizeStationLabel(partenza[1]);
    const to = normalizeStationLabel(arrivo[1]);
    if (from.length >= 3 && to.length >= 3) return { from, to };
  }

  const arrow = text.match(
    /([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{1,40}?)\s*(?:→|->|—|–|verso)\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{1,40})/u,
  );
  if (arrow?.[1] && arrow[2]) {
    const from = normalizeStationLabel(arrow[1]);
    const to = normalizeStationLabel(arrow[2]);
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

function findTrainService(text: string): { service: string; trainNumber: string } | null {
  const match = text.match(TRAIN_SERVICE_FIND_RE);
  if (!match?.[1] || !match?.[2]) return null;
  return { service: match[1].trim(), trainNumber: match[2].trim() };
}

function buildRailTitle(
  service: { service: string; trainNumber: string } | null,
  location: string,
  subject: string,
): string {
  if (service) return `${service.service} ${service.trainNumber}`;
  if (location) return location;
  return cleanStation(subject) || "Train";
}

function extractRailTicketFactsFromSegment(
  text: string,
  subject: string,
  sharedConfirmation: string,
): RailTicketFacts | null {
  const combined = `${subject}\n${text}`.replace(/\r/gu, "");
  if (!isRailTicketText(combined)) return null;

  const stations = findStations(combined);
  const localTime = findDepartureLocalTime(combined);
  const confirmationCode = findConfirmation(combined) || sharedConfirmation;
  const provider = findProvider(combined);
  const notes = findPlatformNote(combined);
  const service = findTrainService(combined);
  if (!stations && !localTime && !confirmationCode && !service) return null;

  const location = stations ? `${stations.from} → ${stations.to}` : "";
  const title = buildRailTitle(service, location, subject);

  return {
    title,
    provider,
    trainNumber: service?.trainNumber ?? "",
    localTime: localTime ?? "",
    location,
    confirmationCode,
    timezone: ITALIAN_RAIL_RE.test(combined) ? "Europe/Rome" : "",
    notes,
  };
}

/** Extract passenger names + ticket numbers when explicitly labeled on a Trenitalia PDF. */
export function extractRailPassengers(text: string): RailPassengerFacts[] {
  const passengers: RailPassengerFacts[] = [];
  const seen = new Set<string>();
  const pattern = /(?:passeggero|passenger|passeggera)\s*[:\s]*\n?\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'. ]{2,40})/giu;

  for (const match of text.matchAll(pattern)) {
    const name = match[1]?.trim() ?? "";
    if (!name || name.length < 5) continue;
    const window = text.slice(match.index ?? 0, (match.index ?? 0) + 220);
    const ticketMatch = window.match(/\b(?:biglietto|ticket)\s*[:#]?\s*(\d{8,12})\b/iu);
    const seatMatch = window.match(/\b(?:coach|carrozza)\s*(\d+)\s*(?:posto|seat)?\s*([0-9]+[A-Z]?)\b/iu);
    const coachSeat = seatMatch ? `${seatMatch[1]}/${seatMatch[2]}` : "";
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    passengers.push({
      name,
      ticketNumber: ticketMatch?.[1] ?? "",
      coachSeat,
    });
  }

  return passengers;
}

function splitRailLegSegments(text: string): string[] {
  const matches = [...text.matchAll(TRAIN_SERVICE_SPLIT_RE)];
  if (matches.length <= 1) return [text];

  const segments: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index]?.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1]?.index ?? text.length) : text.length;
    segments.push(text.slice(start, end));
  }
  return segments;
}

/** One leg per train service number (8312 + 91312 on the same day). */
export function extractRailTicketLegs(text: string, subject = ""): RailTicketFacts[] {
  const combined = `${subject}\n${text}`.replace(/\r/gu, "");
  if (!isRailTicketText(combined)) return [];

  const sharedConfirmation = findConfirmation(combined);
  const segments = splitRailLegSegments(combined);
  const legs = segments
    .map((segment) => extractRailTicketFactsFromSegment(segment, subject, sharedConfirmation))
    .filter((facts): facts is RailTicketFacts => Boolean(facts));

  if (legs.length > 0) {
    const byTrain = new Map<string, RailTicketFacts>();
    for (const leg of legs) {
      const key = leg.trainNumber || `${leg.localTime}|${leg.location}`;
      if (!byTrain.has(key)) byTrain.set(key, leg);
    }
    return [...byTrain.values()].sort((a, b) => a.localTime.localeCompare(b.localTime));
  }

  const single = extractRailTicketFactsFromSegment(combined, subject, sharedConfirmation);
  return single ? [single] : [];
}

export function extractRailTicketFacts(text: string, subject = ""): RailTicketFacts | null {
  const legs = extractRailTicketLegs(text, subject);
  return legs[0] ?? null;
}
