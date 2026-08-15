/**
 * Word-letter day plan (I47) — headings and stay facts like Puglia_itinerary.docx.
 * Dedupe still applies (I31). Stay fine print is a stay block, not a collapsed day.
 */

import { isDayPlanDetailLine } from "@/lib/travelAssistant/dayPlanBulletGroups";

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
