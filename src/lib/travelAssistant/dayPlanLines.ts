import { parseDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import { buildDayStayTimeline } from "@/lib/travelAssistant/dayStayTimeline";

export type DayLineKind = "travel" | "hotel" | "dining" | "activity" | "note";

export interface ClassifiedDayLine {
  text: string;
  kind: DayLineKind;
  icon: string;
}

const LINE_SPLIT = /\r?\n|;/u;

/** Trimmed lines for parsing intent — not for live text editing. */
export function parseDayLines(note: string): string[] {
  return note
    .split(LINE_SPLIT)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Preserve spaces while the user types (do not trim line bodies). */
export function parseDayLinesForEditor(note: string): string[] {
  if (!note) return [""];
  const split = note.split(LINE_SPLIT);
  return split.length > 0 ? split : [""];
}

export function serializeDayLines(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

/** Join editor lines without stripping interior or trailing spaces mid-word. */
export function serializeDayLinesForEditor(lines: string[]): string {
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0] ?? "";
  return lines.join("\n");
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

/** Combined intent from all lines on a day (travel/move lines win over generic notes). */
export function parseDayIntentFromLines(note: string) {
  const lines = parseDayLines(note);
  let best: ReturnType<typeof parseDayIntent> = null;

  for (const line of lines) {
    const intent = parseDayIntent(line);
    if (!intent || intent.kind === "unknown") continue;
    if (intent.kind === "move" || intent.kind === "depart") return intent;
    if (intent.kind === "arrive" && (!best || best.kind === "stay")) best = intent;
    if (intent.kind === "stay" && !best) best = intent;
  }

  if (best) return best;
  return parseDayIntent(note);
}

export function resolveStayCityForDay(
  dateKey: string,
  dayNotes: Record<string, string>,
  stopRanges: StopDateRange[] = [],
  tripStartDate?: string | null,
  tripEndDate?: string | null,
): string | null {
  for (const range of stopRanges) {
    if (dateKey >= range.checkIn && dateKey < range.checkOut) {
      return range.stop.name;
    }
  }

  if (tripStartDate && tripEndDate) {
    const timeline = buildDayStayTimeline(tripStartDate, tripEndDate, dayNotes, stopRanges);
    const snapshot = timeline.get(dateKey);
    if (snapshot) return snapshot.stayCity;
  }

  const direct = parseDayIntentFromLines(dayNotes[dateKey] ?? "");
  if (direct?.kind === "depart") return null;
  if (direct?.stayCity) return direct.stayCity;
  if (direct?.toCity && direct.kind === "move") return direct.toCity;
  if (direct?.toCity) return direct.toCity;

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
