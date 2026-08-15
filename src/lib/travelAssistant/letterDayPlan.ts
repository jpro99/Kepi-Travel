/**
 * Word-letter day plan (I47 / I48) — headings and stay facts like Puglia_itinerary.docx.
 * Stay facts belong on the check-in / check-out day, not in one pile at the top.
 */

import { isDayPlanDetailLine } from "@/lib/travelAssistant/dayPlanBulletGroups";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import { dateOnly } from "@/lib/travelAssistant/tripWindow";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function utcParts(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** "Sept 2" — matches the forwarded Word day headers. */
export function formatLetterDayHeading(dateKey: string, subtitle?: string | null): string {
  const parts = utcParts(dateKey);
  if (!parts) return subtitle?.trim() || dateKey;
  const month = MONTH_SHORT[parts.month - 1] ?? String(parts.month);
  const base = `${month} ${parts.day}`;
  const extra = subtitle?.trim();
  return extra ? `${base}: ${extra}` : base;
}

/** "SEPT 2–12" for the letter title line. */
export function formatLetterMonthRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string {
  const start = utcParts(startDate ?? "");
  const end = utcParts(endDate ?? "");
  if (!start) return "";
  const startMonth = (MONTH_SHORT[start.month - 1] ?? "").toUpperCase();
  if (!end) return `${startMonth} ${start.day}`;
  const endMonth = (MONTH_SHORT[end.month - 1] ?? "").toUpperCase();
  if (start.month === end.month) return `${startMonth} ${start.day}–${end.day}`;
  return `${startMonth} ${start.day}–${endMonth} ${end.day}`;
}

/** "September 2–5: Polignano a Mare" */
export function formatLetterCityRange(
  startKey: string,
  endKey: string,
  location: string,
): string {
  const start = utcParts(startKey);
  const end = utcParts(endKey);
  const city = location.trim();
  if (!start || !end) return city;
  const month = MONTH_LONG[start.month - 1] ?? "";
  const span =
    start.month === end.month
      ? `${month} ${start.day}–${end.day}`
      : `${month} ${start.day}–${MONTH_LONG[end.month - 1] ?? ""} ${end.day}`;
  return city ? `${span}: ${city}` : span;
}

export interface LetterCityRange {
  startKey: string;
  endKey: string;
  location: string;
  label: string;
}

export function buildLetterCityRanges(
  days: Array<{ dateKey: string; location?: string | null }>,
): LetterCityRange[] {
  const ranges: LetterCityRange[] = [];
  let current: { startKey: string; endKey: string; location: string } | null = null;
  for (const day of days) {
    const location = day.location?.trim() ?? "";
    if (!location) {
      if (current) {
        ranges.push({
          ...current,
          label: formatLetterCityRange(current.startKey, current.endKey, current.location),
        });
        current = null;
      }
      continue;
    }
    if (current && current.location === location) {
      current.endKey = day.dateKey;
      continue;
    }
    if (current) {
      ranges.push({
        ...current,
        label: formatLetterCityRange(current.startKey, current.endKey, current.location),
      });
    }
    current = { startKey: day.dateKey, endKey: day.dateKey, location };
  }
  if (current) {
    ranges.push({
      ...current,
      label: formatLetterCityRange(current.startKey, current.endKey, current.location),
    });
  }
  return ranges;
}

/** Stay logistics belong in the letter header, not as hidden day details. */
export function splitLetterStayAndActivities(lines: string[]): {
  stayLines: string[];
  activityLines: string[];
} {
  const stayLines: string[] = [];
  const activityLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isDayPlanDetailLine(trimmed)) stayLines.push(trimmed);
    else activityLines.push(trimmed);
  }
  return { stayLines, activityLines };
}

export function letterTitleLine(
  tripName: string,
  startDate?: string | null,
  endDate?: string | null,
  importedTitle?: string | null,
): string {
  const imported = importedTitle?.trim();
  if (imported && /itinerary/iu.test(imported)) return imported;
  const range = formatLetterMonthRange(startDate, endDate);
  const name = tripName.trim() || "Trip itinerary";
  return range ? `${name}: ${range}` : name;
}

export interface LetterStayReservation {
  type?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
}

export type LetterStayRole = "check_in" | "check_out" | "staying";

/** Clock from a stored local time — "2026-09-02 16:00" → "4:00 PM". */
export function formatLetterClock(value?: string | null): string {
  const match = /(\d{1,2}):(\d{2})/u.exec((value ?? "").trim());
  if (!match) return "";
  let hour = Number(match[1]);
  if (!Number.isFinite(hour)) return "";
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function stayRoleOnDay(
  stay: LetterStayReservation,
  dateKey: string,
): LetterStayRole | null {
  if ((stay.type ?? "hotel") !== "hotel") return null;
  const checkIn = dateOnly(stay.localTime);
  const checkOut = dateOnly(stay.checkOutDate);
  if (checkIn && checkIn === dateKey) return "check_in";
  if (checkOut && checkOut === dateKey) return "check_out";
  if (checkIn && checkOut && checkIn < dateKey && dateKey < checkOut) return "staying";
  return null;
}

function stayName(stay: LetterStayReservation): string {
  return reservationPropertyName({
    type: "hotel",
    title: stay.title,
    provider: stay.provider,
    location: stay.location,
    notes: stay.notes,
  });
}

function confirmationLine(stay: LetterStayReservation): string | null {
  const code = stay.confirmationCode?.trim();
  if (!code) return null;
  const via = stay.provider?.trim();
  return via ? `Confirmation ${code} · via ${via}` : `Confirmation ${code}`;
}

function datedClock(dateKey: string, localTime?: string | null): string {
  const day = formatLetterDayHeading(dateKey);
  const clock = formatLetterClock(localTime);
  return clock ? `${day} at ${clock}` : day;
}

/**
 * Hotel facts for one calendar day only.
 * Check-in day gets name, address, times, confirmation.
 * Check-out day gets the leave line.
 * Mid-stay is one "Staying at" line — never a dump of every hotel.
 */
export function letterStayFactsForDay(
  dateKey: string,
  stays: LetterStayReservation[],
  letterHeader?: { lines?: string[]; stayLocation?: string } | null,
): string[] {
  const lines: string[] = [];
  const hotels = stays.filter((stay) => (stay.type ?? "hotel") === "hotel");
  const checkIns = hotels.filter((stay) => stayRoleOnDay(stay, dateKey) === "check_in");

  for (const stay of hotels) {
    const role = stayRoleOnDay(stay, dateKey);
    if (!role) continue;
    const name = stayName(stay);
    const checkIn = dateOnly(stay.localTime);
    const checkOut = dateOnly(stay.checkOutDate);
    if (role === "check_in") {
      lines.push(`Check in · ${name || "Hotel"}`);
      if (stay.location?.trim() && stay.location.trim() !== name) {
        lines.push(stay.location.trim());
      }
      if (checkIn) lines.push(`Check-in ${datedClock(checkIn, stay.localTime)}`);
      if (checkOut) lines.push(`Check-out ${datedClock(checkOut, stay.checkOutDate)}`);
      const confirmation = confirmationLine(stay);
      if (confirmation) lines.push(confirmation);
      continue;
    }
    if (role === "check_out") {
      lines.push(`Check out · ${name || "Hotel"}`);
      if (checkOut) lines.push(`Check-out ${datedClock(checkOut, stay.checkOutDate)}`);
      const confirmation = confirmationLine(stay);
      if (confirmation) lines.push(confirmation);
      continue;
    }
    if (name) lines.push(`Staying at ${name}`);
  }

  const headerLines = (letterHeader?.lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (headerLines.length > 0 && checkIns.length > 0) {
    const city = (letterHeader?.stayLocation ?? "").trim().toLowerCase();
    const matchesCity = checkIns.some((stay) => {
      const loc = (stay.location ?? "").trim().toLowerCase();
      const title = (stay.title ?? "").trim().toLowerCase();
      const haystack = `${stay.location ?? ""} ${stay.title ?? ""} ${stay.notes ?? ""}`.toLowerCase();
      if (city) {
        return haystack.includes(city) || (loc.length > 0 && (city.includes(loc) || loc.includes(city)));
      }
      const tokens = [loc, title].filter((token) => token.length >= 4);
      return tokens.some((token) =>
        headerLines.some((line) => line.toLowerCase().includes(token)),
      );
    });
    if (matchesCity) {
      for (const line of headerLines) {
        if (!lines.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
          lines.push(line);
        }
      }
    }
  }

  return lines;
}

export function dayHasLetterContent(input: {
  bullets?: string[];
  stayFacts?: string[];
  bookingLines?: string[];
  hotelLine?: string | null;
}): boolean {
  return (
    (input.bullets?.length ?? 0) > 0 ||
    (input.stayFacts?.length ?? 0) > 0 ||
    (input.bookingLines?.length ?? 0) > 0 ||
    Boolean(input.hotelLine?.trim())
  );
}
