/**
 * Labeled hotel check-in / check-out extraction (I39).
 * Airbnb cards use yearless "Sat, Sep 12" — year comes from other dates in the email
 * (e.g. payment Aug 29, 2026), never from inventing a silent guess.
 */

import { correctPastTravelIsoDate } from "@/lib/travelAssistant/travelDateCorrection";

const MONTH_NAME =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const WEEKDAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*";

/** Month + day, optional weekday — no year (Airbnb). */
const YEARLESS_MONTH_DAY_RE = new RegExp(
  `\\b(?:${WEEKDAY},?\\s+)?((?:${MONTH_NAME})\\.?\\s+\\d{1,2})\\b`,
  "iu",
);

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface LabeledHotelStayDates {
  checkInLocalTime: string;
  checkOutDate: string;
  yearUsed: number;
}

function parseMonthDay(raw: string): { month: number; day: number } | null {
  const match = raw
    .trim()
    .match(
      new RegExp(`^(${MONTH_NAME})\\.?\\s+(\\d{1,2})$`, "iu"),
    );
  if (!match?.[1] || !match[2]) return null;
  const month = MONTH_INDEX[match[1].toLowerCase().replace(/\./gu, "")];
  const day = Number.parseInt(match[2], 10);
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Years explicitly present in the email body (payment lines, yearful dates). */
export function collectExplicitYearsFromText(text: string): number[] {
  const years = [...text.matchAll(/\b(20\d{2})\b/gu)]
    .map((m) => Number.parseInt(m[1] ?? "", 10))
    .filter((y) => y >= 2020 && y <= 2100);
  return [...new Set(years)].sort((a, b) => a - b);
}

/**
 * Pick a calendar year for a month/day using years stated in the email, else
 * the next future occurrence from referenceDate (honest: year was not on the card).
 */
export function resolveYearForMonthDay(
  month: number,
  day: number,
  yearHints: number[],
  referenceDate = new Date(),
): number {
  const graceMs = referenceDate.getTime() - 14 * 86_400_000;
  const candidates =
    yearHints.length > 0
      ? yearHints
      : [referenceDate.getFullYear(), referenceDate.getFullYear() + 1];

  for (const year of candidates) {
    const ms = Date.parse(`${formatIso(year, month, day)}T12:00:00Z`);
    if (!Number.isNaN(ms) && ms >= graceMs) return year;
  }

  // All hints in the past — bump via shared past-date correction.
  const seed = formatIso(candidates[candidates.length - 1] ?? referenceDate.getFullYear(), month, day);
  const corrected = correctPastTravelIsoDate(seed, referenceDate);
  return Number.parseInt(corrected.slice(0, 4), 10);
}

function extractLabeledMonthDay(
  lineAwareText: string,
  label: RegExp,
): { monthDay: string; block: string } | null {
  const lines = lineAwareText.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!label.test(line)) continue;
    const inline = line.match(YEARLESS_MONTH_DAY_RE)?.[1];
    if (inline) {
      return { monthDay: inline, block: [line, lines[i + 1], lines[i + 2]].filter(Boolean).join("\n") };
    }
    for (let j = i + 1; j <= i + 3 && j < lines.length; j += 1) {
      const next = lines[j] ?? "";
      if (/^\s*$/u.test(next)) continue;
      // Stop if we hit the other stay label.
      if (/\bcheck[\s-]?(?:in|out)\b/iu.test(next) && !label.test(next)) break;
      const md = next.match(YEARLESS_MONTH_DAY_RE)?.[1];
      if (md) {
        return {
          monthDay: md,
          block: [line, lines[i + 1], lines[i + 2], lines[i + 3]].filter(Boolean).join("\n"),
        };
      }
    }
  }
  return null;
}

function extractCheckInTime(block: string): string {
  const afterMatch = block.match(/\bAfter\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu);
  const fromMatch = block.match(/\bfrom\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu);
  const plain = block.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu);
  const raw = afterMatch?.[1] ?? fromMatch?.[1] ?? plain?.[1] ?? "";
  const trimmed = raw.trim();
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/iu.exec(trimmed);
  if (!m) return "15:00";
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]!.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Airbnb / OTA labeled stay cards — yearless month-day under Check-in / Checkout.
 * Returns null when either side is missing (do not half-apply payment dates).
 */
export function extractLabeledHotelStayDates(
  lineAwareText: string,
  referenceDate = new Date(),
): LabeledHotelStayDates | null {
  const checkInHit = extractLabeledMonthDay(lineAwareText, /\bcheck[\s-]?in\b/iu);
  const checkOutHit = extractLabeledMonthDay(lineAwareText, /\bcheck[\s-]?out\b/iu);
  if (!checkInHit || !checkOutHit) return null;

  const checkInParts = parseMonthDay(checkInHit.monthDay);
  const checkOutParts = parseMonthDay(checkOutHit.monthDay);
  if (!checkInParts || !checkOutParts) return null;

  const yearHints = collectExplicitYearsFromText(lineAwareText);
  const year = resolveYearForMonthDay(
    checkInParts.month,
    checkInParts.day,
    yearHints,
    referenceDate,
  );

  let checkInIso = formatIso(year, checkInParts.month, checkInParts.day);
  let checkOutIso = formatIso(year, checkOutParts.month, checkOutParts.day);
  // Overnight year wrap (Dec → Jan)
  if (checkOutIso < checkInIso) {
    checkOutIso = formatIso(year + 1, checkOutParts.month, checkOutParts.day);
  }
  checkInIso = correctPastTravelIsoDate(checkInIso, referenceDate);
  checkOutIso = correctPastTravelIsoDate(checkOutIso, referenceDate);
  if (checkOutIso < checkInIso) {
    checkOutIso = correctPastTravelIsoDate(
      formatIso(Number.parseInt(checkInIso.slice(0, 4), 10) + 1, checkOutParts.month, checkOutParts.day),
      referenceDate,
    );
  }

  const time = extractCheckInTime(checkInHit.block);
  return {
    checkInLocalTime: `${checkInIso} ${time}`,
    checkOutDate: checkOutIso,
    yearUsed: Number.parseInt(checkInIso.slice(0, 4), 10),
  };
}

/**
 * Airbnb "Address\nRio dei Miracoli, 30121 Venice, Veneto, Italy" → "Venice".
 */
export function extractHotelAddressLocation(lineAwareText: string): string {
  const addressLine =
    lineAwareText.match(/\bAddress\b[:\s]*\n\s*([^\n]{5,140})/iu)?.[1]?.trim() ??
    lineAwareText.match(/\bAddress\b[:\s]+([^\n]{5,140})/iu)?.[1]?.trim() ??
    "";
  if (!addressLine) return "";

  const parts = addressLine
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";

  const countryIdx = parts.findIndex((p) =>
    /^(Italy|Italia|France|Spain|Germany|Portugal|Greece|USA|United States|UK|United Kingdom|Japan|Canada|Mexico|Austria|Switzerland|Croatia|Slovenia)$/iu.test(
      p,
    ),
  );
  if (countryIdx >= 1) {
    // Prefer the token just before region/country that looks like a city (strip postal).
    const cityCandidate =
      (countryIdx >= 2 ? parts[countryIdx - 2] : parts[countryIdx - 1]) ??
      parts[countryIdx - 1] ??
      "";
    const city = cityCandidate.replace(/^\d{4,6}\s+/u, "").trim();
    if (city && !/^\d+$/u.test(city)) return city;
  }

  // Fallback: last comma segment that isn't only digits.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = (parts[i] ?? "").replace(/^\d{4,6}\s+/u, "").trim();
    if (part && !/^\d+$/u.test(part) && part.length >= 2) return part;
  }
  return "";
}
