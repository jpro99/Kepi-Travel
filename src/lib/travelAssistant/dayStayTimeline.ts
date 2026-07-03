import type { StopDateRange } from "@/lib/decision/stopDates";
import { parseDayIntentFromLines, parseDayLines } from "@/lib/travelAssistant/dayPlanLines";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import { normalizeDayPlanCity, stripTrailingDateNoise } from "@/lib/travelAssistant/normalizeDayPlanCity";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";

export type DayStayPhase = "stay" | "travel" | "depart" | "open";

export interface DayStaySnapshot {
  stayCity: string | null;
  phase: DayStayPhase;
  headline: string | null;
  intent: ParsedDayIntent | null;
}

function isLeaveOnlyDay(note: string, intent: ParsedDayIntent | null): boolean {
  if (!note.trim()) return false;
  if (intent?.kind === "depart") return true;
  if (intent?.kind === "move") return false;
  if (/\bleave(?:ing)?\b/iu.test(note) && !/\b(?:go(?:\s+to)?|head(?:\s+to)?|travel(?:\s+to)?|get(?:\s+to)?|for)\s+\S/iu.test(note)) {
    return true;
  }
  return Boolean(intent?.needsHotelCheckout && !intent.needsHotelCheckin && !intent.toCity && !intent.stayCity);
}

function cityFromIntent(intent: ParsedDayIntent | null): string | null {
  if (!intent) return null;
  if (intent.kind === "move" && intent.toCity) return intent.toCity;
  if (intent.stayCity) return intent.stayCity;
  if (intent.toCity && intent.kind !== "depart") return intent.toCity;
  return null;
}

/**
 * Walk the trip forward day-by-day — no backward bleed from old cities.
 * stopRanges win when they cover a date; otherwise note intents apply.
 */
export function buildDayStayTimeline(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  dayNotes: Record<string, string>,
  stopRanges: StopDateRange[] = [],
): Map<string, DayStaySnapshot> {
  const start = tripStartDate?.slice(0, 10);
  const end = tripEndDate?.slice(0, 10);
  const timeline = new Map<string, DayStaySnapshot>();
  if (!start || !end || start > end) return timeline;

  const dayKeys = buildFullTripDayKeys(start, end, []);
  let activeCity: string | null = null;

  for (const dayKey of dayKeys) {
    const range = stopRanges.find((row) => dayKey >= row.checkIn && dayKey < row.checkOut);
    if (range) {
      activeCity = range.stop.name;
      timeline.set(dayKey, {
        stayCity: range.stop.name,
        phase: "stay",
        headline: `Stay in ${range.stop.name}`,
        intent: null,
      });
      continue;
    }

    const note = dayNotes[dayKey]?.trim() ?? "";
    const intent = note ? parseDayIntentFromLines(note) : null;

    if (isLeaveOnlyDay(note, intent)) {
      const leaving = intent?.fromCity ?? activeCity;
      activeCity = null;
      timeline.set(dayKey, {
        stayCity: null,
        phase: "depart",
        headline: leaving ? `Leave ${leaving}` : "Travel day",
        intent,
      });
      continue;
    }

    if (intent?.kind === "move" && intent.toCity) {
      activeCity = intent.toCity;
      timeline.set(dayKey, {
        stayCity: intent.toCity,
        phase: "travel",
        headline: `Travel to ${intent.toCity}`,
        intent,
      });
      continue;
    }

    const nextCity = cityFromIntent(intent);
    if (nextCity) {
      activeCity = nextCity;
      timeline.set(dayKey, {
        stayCity: nextCity,
        phase: intent?.kind === "arrive" ? "travel" : "stay",
        headline: intent?.summary ?? `Stay in ${nextCity}`,
        intent,
      });
      continue;
    }

    if (note) {
      for (const line of parseDayLines(note)) {
        const inMatch = line.match(/\b(?:in|stay(?:ing)? in|at)\s+(.+)/iu);
        if (inMatch?.[1]) {
          const city = normalizeDayPlanCity(stripTrailingDateNoise(inMatch[1]));
          if (city) {
            activeCity = city;
            timeline.set(dayKey, {
              stayCity: city,
              phase: "stay",
              headline: `Stay in ${city}`,
              intent,
            });
            break;
          }
        }
      }
      if (timeline.has(dayKey)) continue;
    }

    if (activeCity) {
      timeline.set(dayKey, {
        stayCity: activeCity,
        phase: "stay",
        headline: `Stay in ${activeCity}`,
        intent: null,
      });
    } else {
      timeline.set(dayKey, {
        stayCity: null,
        phase: "open",
        headline: null,
        intent: null,
      });
    }
  }

  return timeline;
}

export function resolveStayCityForDayFromTimeline(
  dateKey: string,
  timeline: Map<string, DayStaySnapshot>,
): string | null {
  return timeline.get(dateKey)?.stayCity ?? null;
}
