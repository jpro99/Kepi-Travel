/**
 * Parse narrative day-plan itineraries (Word/email forwards like Jeff's Puglia doc)
 * into per-day plan notes. Not a booking confirmation parser.
 */

import {
  EMPTY_DAY_PLAN,
  dayPlanToNote,
  normalizeItineraryPlans,
  type DayPlanRecord,
  type ItineraryPlansData,
} from "@/lib/travelAssistant/itineraryDayPlan";
import { remapDayKeyIntoTripWindow } from "@/lib/travelAssistant/tripWindow";

export interface ParsedDayPlanDay {
  dateKey: string;
  heading?: string;
  bullets: string[];
  location?: string;
}

export interface ParsedDayPlanItinerary {
  title: string;
  headerLines: string[];
  stayLocation?: string;
  stayAddress?: string;
  checkInHint?: string;
  checkOutHint?: string;
  days: ParsedDayPlanDay[];
  confidence: number;
  kind: "day-plan-itinerary";
}

const MONTH_MAP: Record<string, number> = {
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.parse(`${year}-${pad2(month)}-${pad2(day)}T12:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function inferYear(text: string, tripStartDate?: string | null): number {
  const fromTrip = tripStartDate?.trim().slice(0, 4);
  if (fromTrip && /^\d{4}$/u.test(fromTrip)) return Number(fromTrip);
  const yearMatch = text.match(/\b(20\d{2})\b/u);
  if (yearMatch?.[1]) return Number(yearMatch[1]);
  return new Date().getUTCFullYear();
}

function parseMonthToken(raw: string): number | null {
  const key = raw.trim().toLowerCase().replace(/\./gu, "");
  return MONTH_MAP[key] ?? null;
}

/** Detect narrative itinerary (vs booking confirmation). */
export function looksLikeDayPlanItinerary(text: string, subject = ""): boolean {
  const combined = `${subject}\n${text}`.trim();
  if (combined.length < 80) return false;
  const dayHits = [
    ...combined.matchAll(
      /\b(?:sept?|sep|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?)\.?\s+\d{1,2}\b/giu,
    ),
  ];
  const isoDayHits = [...combined.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/gu)];
  const dayNHits = [...combined.matchAll(/\bday\s+\d{1,2}\b/giu)];
  const hasItineraryWord = /\bitinerary\b/iu.test(combined);
  const hasCheckInOut = /check\s*[- ]?in/iu.test(combined) && /check\s*[- ]?out/iu.test(combined);
  const bulletish = (combined.match(/(?:^|\n)\s*[•\-\*]\s+\S/gu) ?? []).length;
  const score =
    (dayHits.length >= 3 ? 2 : dayHits.length >= 2 ? 1 : 0) +
    (isoDayHits.length >= 3 ? 2 : 0) +
    (dayNHits.length >= 3 ? 1 : 0) +
    (hasItineraryWord ? 1 : 0) +
    (hasCheckInOut ? 1 : 0) +
    (bulletish >= 4 ? 1 : 0);
  // Booking confirmations usually have confirmation codes + few day headers.
  const looksLikeBooking =
    /\bconfirmation\s*(?:number|code|#)\b/iu.test(combined) &&
    dayHits.length < 2 &&
    !hasItineraryWord;
  if (looksLikeBooking) return false;
  return score >= 3;
}

type RangeContext = { location: string; startDay: number; endDay: number; month: number };

function parseRangeHeader(line: string, year: number): RangeContext | null {
  // September 2–5: Polignano a Mare  /  Sept 2-5 Polignano
  const match = line.match(
    /^\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?|sep|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\s*[–\-—to]+\s*(\d{1,2})\s*[:\-–]?\s*(.+)?$/iu,
  );
  if (!match) return null;
  const month = parseMonthToken(match[1]!);
  if (!month) return null;
  const startDay = Number(match[2]);
  const endDay = Number(match[3]);
  const location = (match[4] ?? "").replace(/^[:\-–]\s*/u, "").trim();
  if (!toDateKey(year, month, startDay) || !toDateKey(year, month, endDay)) return null;
  return { location, startDay, endDay, month };
}

function parseDayHeader(
  line: string,
  year: number,
  fallbackMonth: number | null,
): { dateKey: string; heading?: string; month: number; day: number } | null {
  // Sept 2:  / September 4: BEST VIEWPOINTS / Sept 3 —
  const named = line.match(
    /^\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?|sep|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\s*[:\-–]?\s*(.*)$/iu,
  );
  if (named) {
    const month = parseMonthToken(named[1]!);
    const day = Number(named[2]);
    if (!month) return null;
    const dateKey = toDateKey(year, month, day);
    if (!dateKey) return null;
    const rest = (named[3] ?? "").trim();
    const heading = rest && !/^[•\-\*]/u.test(rest) ? rest : undefined;
    return { dateKey, heading, month, day };
  }

  // Day 2: ...
  const dayN = line.match(/^\s*day\s+(\d{1,2})\s*[:\-–]?\s*(.*)$/iu);
  if (dayN && fallbackMonth) {
    const day = Number(dayN[1]);
    const dateKey = toDateKey(year, fallbackMonth, day);
    if (!dateKey) return null;
    const rest = (dayN[2] ?? "").trim();
    return { dateKey, heading: rest || undefined, month: fallbackMonth, day };
  }

  // 2026-09-02: ...
  const iso = line.match(/^\s*(20\d{2})-(\d{2})-(\d{2})\s*[:\-–]?\s*(.*)$/u);
  if (iso) {
    const dateKey = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const rest = (iso[4] ?? "").trim();
    return {
      dateKey,
      heading: rest || undefined,
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  return null;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[•\-\*▪◦]\s+/u, "").trim();
}

function extractTitle(lines: string[], subject: string): string {
  for (const line of lines.slice(0, 8)) {
    if (/itinerary/iu.test(line) && line.length < 120) return line.trim();
  }
  if (subject.trim() && /itinerary/iu.test(subject)) return subject.trim();
  return subject.trim() || "Trip itinerary";
}

function extractStayMeta(lines: string[]): {
  headerLines: string[];
  stayLocation?: string;
  stayAddress?: string;
  checkInHint?: string;
  checkOutHint?: string;
} {
  const headerLines: string[] = [];
  let stayAddress: string | undefined;
  let stayLocation: string | undefined;
  let checkInHint: string | undefined;
  let checkOutHint: string | undefined;

  for (const line of lines.slice(0, 40)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (parseDayHeader(trimmed, 2026, 9) || parseRangeHeader(trimmed, 2026)) break;

    if (/^address\s*:/iu.test(trimmed) || /\d{1,5}\s+\w+.*,\s*\d{4,}/u.test(trimmed)) {
      stayAddress = trimmed.replace(/^address\s*:\s*/iu, "").trim();
      headerLines.push(trimmed);
      const cityMatch = stayAddress.match(/,\s*([^,]+),\s*Italy/iu) ?? stayAddress.match(/,\s*([^,]+)\s*$/u);
      if (cityMatch?.[1]) stayLocation = cityMatch[1].trim();
      continue;
    }
    if (/check\s*[- ]?in/iu.test(trimmed)) {
      headerLines.push(trimmed);
      const inMatch = trimmed.match(/check\s*[- ]?in\s*:?\s*([^\-–]+)/iu);
      const outMatch = trimmed.match(/check\s*[- ]?out\s*:?\s*(.+)$/iu);
      if (inMatch?.[1]) checkInHint = inMatch[1].trim();
      if (outMatch?.[1]) checkOutHint = outMatch[1].trim();
      continue;
    }
    if (/tourist tax|breakfast|late check/iu.test(trimmed)) {
      headerLines.push(trimmed);
    }
  }

  return { headerLines, stayLocation, stayAddress, checkInHint, checkOutHint };
}

export function parseDayPlanItinerary(
  text: string,
  options: { subject?: string; tripStartDate?: string | null; tripEndDate?: string | null } = {},
): ParsedDayPlanItinerary | null {
  const subject = options.subject ?? "";
  const cleaned = text.replace(/\r\n/gu, "\n").trim();
  if (!looksLikeDayPlanItinerary(cleaned, subject)) return null;

  const year = inferYear(`${subject}\n${cleaned}`, options.tripStartDate);
  const lines = cleaned.split("\n").map((l) => l.replace(/\u00a0/gu, " "));
  const title = extractTitle(lines, subject);
  const stayMeta = extractStayMeta(lines);

  const daysByKey = new Map<string, ParsedDayPlanDay>();
  let active: ParsedDayPlanDay | null = null;
  let activeRange: RangeContext | null = null;
  let lastMonth: number | null = null;
  let dayHeaderCount = 0;

  const ensureDay = (dateKey: string, location?: string, heading?: string): ParsedDayPlanDay => {
    const existing = daysByKey.get(dateKey);
    if (existing) {
      if (heading && !existing.heading) existing.heading = heading;
      if (location && !existing.location) existing.location = location;
      return existing;
    }
    const created: ParsedDayPlanDay = {
      dateKey,
      heading,
      bullets: [],
      location: location || stayMeta.stayLocation,
    };
    daysByKey.set(dateKey, created);
    return created;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const range = parseRangeHeader(line, year);
    if (range) {
      activeRange = range;
      lastMonth = range.month;
      active = null;
      for (let d = range.startDay; d <= range.endDay; d += 1) {
        const dateKey = toDateKey(year, range.month, d);
        if (dateKey) ensureDay(dateKey, range.location || stayMeta.stayLocation);
      }
      continue;
    }

    const dayHeader = parseDayHeader(line, year, lastMonth ?? activeRange?.month ?? null);
    if (dayHeader) {
      dayHeaderCount += 1;
      lastMonth = dayHeader.month;
      const loc =
        activeRange &&
        dayHeader.day >= activeRange.startDay &&
        dayHeader.day <= activeRange.endDay &&
        dayHeader.month === activeRange.month
          ? activeRange.location
          : stayMeta.stayLocation;
      active = ensureDay(dayHeader.dateKey, loc, dayHeader.heading);
      // If the rest of the line after the date is a bullet-like sentence, keep it.
      if (dayHeader.heading && /^[a-z]/u.test(dayHeader.heading) === false) {
        // heading already set; if it looks like an activity (long), also add as bullet
        if (dayHeader.heading.length > 40) {
          active.bullets.push(dayHeader.heading);
          active.heading = undefined;
        }
      }
      continue;
    }

    const bullet = stripBullet(line);
    if (bullet && active) {
      // Skip pure section labels already used as headings
      if (active.heading && bullet.toLowerCase() === active.heading.toLowerCase()) continue;
      active.bullets.push(bullet);
      continue;
    }

    // Orphan bullet under a range — attach to range start day as soft content
    if (bullet && activeRange && !active && /^[•\-\*]/u.test(rawLine.trim())) {
      const dateKey = toDateKey(year, activeRange.month, activeRange.startDay);
      if (dateKey) ensureDay(dateKey, activeRange.location).bullets.push(bullet);
    }
  }

  const days = [...daysByKey.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  if (days.length < 2 && dayHeaderCount < 2) return null;

  const withContent = days.filter((d) => d.bullets.length > 0 || d.heading);
  const confidence = Math.min(
    0.95,
    0.45 + dayHeaderCount * 0.08 + withContent.length * 0.04 + (stayMeta.headerLines.length > 0 ? 0.1 : 0),
  );

  return {
    title,
    headerLines: stayMeta.headerLines,
    stayLocation: stayMeta.stayLocation,
    stayAddress: stayMeta.stayAddress,
    checkInHint: stayMeta.checkInHint,
    checkOutHint: stayMeta.checkOutHint,
    days,
    confidence,
    kind: "day-plan-itinerary",
  };
}

function formatDayNotes(day: ParsedDayPlanDay): string {
  const lines: string[] = [];
  if (day.heading) lines.push(day.heading);
  for (const bullet of day.bullets) {
    lines.push(`• ${bullet.replace(/^[•\-\*]\s*/u, "")}`);
  }
  return lines.join("\n").trim();
}

/**
 * Shift day-plan dates into the target trip window when month/day matches
 * (wrong year from Word "SEPT 2–12" without a year).
 */
export function remapParsedDayPlanToTripWindow(
  parsed: ParsedDayPlanItinerary,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): ParsedDayPlanItinerary {
  const remappedDays: ParsedDayPlanDay[] = [];
  for (const day of parsed.days) {
    const nextKey = remapDayKeyIntoTripWindow(day.dateKey, tripStartDate, tripEndDate);
    if (!nextKey) continue;
    remappedDays.push({ ...day, dateKey: nextKey });
  }
  if (remappedDays.length === 0) return parsed;
  remappedDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { ...parsed, days: remappedDays };
}

/**
 * Merge parsed day plan into trip itineraryPlans.
 * Appends bullets when a day already has notes (does not wipe user edits).
 */
export function applyDayPlanToItineraryPlans(
  existing: ItineraryPlansData | undefined,
  parsed: ParsedDayPlanItinerary,
): { plans: ItineraryPlansData; daysApplied: number; dayNotes: Record<string, string> } {
  const plans = normalizeItineraryPlans(existing);
  let daysApplied = 0;
  const dayNotes: Record<string, string> = {};

  // Prefatory stay logistics on the first day if present
  const firstDay = parsed.days[0];
  if (firstDay && parsed.headerLines.length > 0) {
    const headerBlock = parsed.headerLines.map((l) => l.replace(/^[•\-\*]\s*/u, "")).join("\n");
    const existingPlan = plans.dayPlans[firstDay.dateKey] ?? EMPTY_DAY_PLAN(firstDay.location ?? "");
    if (!existingPlan.notes.includes(headerBlock.slice(0, 40))) {
      existingPlan.notes = [headerBlock, existingPlan.notes].filter(Boolean).join("\n\n");
    }
    if (parsed.stayLocation && !existingPlan.location) existingPlan.location = parsed.stayLocation;
    plans.dayPlans[firstDay.dateKey] = existingPlan;
  }

  for (const day of parsed.days) {
    const incoming = formatDayNotes(day);
    if (!incoming && !day.location) continue;
    const prev = plans.dayPlans[day.dateKey] ?? EMPTY_DAY_PLAN(day.location ?? parsed.stayLocation ?? "");
    const next: DayPlanRecord = { ...prev };
    if (day.location) next.location = day.location;
    else if (parsed.stayLocation && !next.location) next.location = parsed.stayLocation;

    if (incoming) {
      if (!next.notes.trim()) {
        next.notes = incoming;
        daysApplied += 1;
      } else if (!next.notes.includes(incoming.slice(0, Math.min(40, incoming.length)))) {
        next.notes = `${next.notes.trim()}\n\n${incoming}`;
        daysApplied += 1;
      }
    } else if (day.location && !prev.location) {
      daysApplied += 1;
    }

    plans.dayPlans[day.dateKey] = next;
    dayNotes[day.dateKey] = dayPlanToNote(next);
  }

  plans.updatedAt = new Date().toISOString();
  return { plans, daysApplied, dayNotes };
}
