import { parseDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";

export type DayLineKind = "travel" | "hotel" | "dining" | "activity" | "note";

export interface ClassifiedDayLine {
  text: string;
  kind: DayLineKind;
  icon: string;
}

const LINE_SPLIT = /\r?\n|;/u;

export function parseDayLines(note: string): string[] {
  return note
    .split(LINE_SPLIT)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeDayLines(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

export function classifyDayLine(text: string): ClassifiedDayLine {
  const lower = text.toLowerCase();
  if (/\b(?:dinner|lunch|brunch|breakfast|restaurant|reservation at|eat at|dining)\b/u.test(lower)) {
    return { text, kind: "dining", icon: "🍽" };
  }
  if (/\b(?:hotel|airbnb|check in|check-in|stay at|hostel|lodging)\b/u.test(lower)) {
    return { text, kind: "hotel", icon: "🏨" };
  }
  if (/\b(?:fly|flight|train|bus|drive|leave|depart|arrive|land in|go to|travel)\b/u.test(lower)) {
    return { text, kind: "travel", icon: "✈" };
  }
  if (/\b(?:museum|tour|hike|beach|shopping|concert|show|visit|explore)\b/u.test(lower)) {
    return { text, kind: "activity", icon: "📍" };
  }
  return { text, kind: "note", icon: "•" };
}

/** Combined intent from all lines on a day (first strong match wins). */
export function parseDayIntentFromLines(note: string) {
  const lines = parseDayLines(note);
  for (const line of lines) {
    const intent = parseDayIntent(line);
    if (intent && intent.kind !== "unknown") return intent;
  }
  return parseDayIntent(note);
}

export function resolveStayCityForDay(
  dateKey: string,
  dayNotes: Record<string, string>,
  stopRanges: StopDateRange[] = [],
): string | null {
  for (const range of stopRanges) {
    if (dateKey >= range.checkIn && dateKey < range.checkOut) {
      return range.stop.name;
    }
  }

  const direct = parseDayIntentFromLines(dayNotes[dateKey] ?? "");
  if (direct?.stayCity) return direct.stayCity;
  if (direct?.toCity && direct.kind !== "depart") return direct.toCity;

  const sortedKeys = Object.keys(dayNotes)
    .filter((key) => key <= dateKey)
    .sort();
  for (let i = sortedKeys.length - 1; i >= 0; i -= 1) {
    const key = sortedKeys[i]!;
    const intent = parseDayIntentFromLines(dayNotes[key] ?? "");
    if (intent?.stayCity && key <= dateKey) return intent.stayCity;
    if (intent?.toCity && intent.kind === "move" && key === dateKey) return intent.toCity;
    if (intent?.toCity && (intent.kind === "arrive" || intent.kind === "stay") && key <= dateKey) {
      return intent.toCity;
    }
    for (const line of parseDayLines(dayNotes[key] ?? "")) {
      const match = line.match(/\b(?:in|stay in|staying in)\s+(.+)/iu);
      if (match?.[1] && key <= dateKey) {
        return match[1].replace(/[.,!?]+$/u, "").trim();
      }
    }
  }

  return null;
}

export function formatDayHeading(dateKey: string): { weekday: string; monthDay: string; iso: string } {
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: date.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    iso: dateKey,
  };
}
