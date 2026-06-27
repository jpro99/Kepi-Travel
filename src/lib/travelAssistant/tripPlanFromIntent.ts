import { allocateStopDates, type StopDateRange } from "@/lib/decision/stopDates";
import { parseTripIntent } from "@/lib/decision/intentParser";
import type { TripIntent } from "@/lib/decision/types";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";

export interface TripPlanSnapshot {
  intent: TripIntent;
  stopRanges: StopDateRange[];
  dayNotes: Record<string, string>;
  tripName: string;
  destination: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function deriveTripName(intent: TripIntent): string {
  const stops = intent.stops ?? [];
  if (stops.length >= 2) {
    const route = stops.map((stop) => stop.name).join(" → ");
    if (route.length <= 52) return route;
    return `${stops[0]!.name} → ${stops[stops.length - 1]!.name}`;
  }
  if (stops.length === 1) return `${stops[0]!.name} trip`;
  return intent.destination?.trim() || "My trip";
}

export function deriveTripDestination(intent: TripIntent): string {
  const stops = intent.stops ?? [];
  if (stops.length > 0) return stops.map((stop) => stop.name).join(" · ");
  return intent.destination?.trim() || "Trip";
}

/** Turn parsed trip intent into spreadsheet-style day notes for the itinerary panel. */
export function buildItineraryDayNotes(intent: TripIntent, ranges: StopDateRange[]): Record<string, string> {
  const notes: Record<string, string> = {};
  const dayKeys = buildFullTripDayKeys(intent.startDate, intent.endDate, []);
  const origin = intent.originCity ?? intent.originAirports?.[0] ?? "home";
  const returnTarget = intent.returnCity ?? intent.originCity ?? "home";
  const stops = intent.stops ?? [];

  if (dayKeys.length === 0) return notes;

  const firstCity = stops[0]?.name ?? intent.destination;
  notes[intent.startDate] = `Fly from ${origin} to ${firstCity}, check into hotel`;

  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i]!;
    let cursor = range.checkIn;
    while (cursor < range.checkOut) {
      if (cursor !== intent.startDate) {
        notes[cursor] = `In ${range.stop.name}`;
      }
      cursor = addDays(cursor, 1);
    }

    const next = ranges[i + 1];
    if (next) {
      notes[range.checkOut] = `Leave ${range.stop.name}, go to ${next.stop.name}`;
    } else {
      const flyDay = intent.endDate >= range.checkOut ? intent.endDate : range.checkOut;
      notes[flyDay] = `Fly from ${range.stop.name} to ${returnTarget}`;
    }
  }

  for (const dayKey of dayKeys) {
    if (!notes[dayKey]) {
      notes[dayKey] = "";
    }
  }

  return notes;
}

export function buildTripPlanFromIntent(rawPrompt: string, referenceDate = new Date()): TripPlanSnapshot {
  const intent = parseTripIntent(rawPrompt, referenceDate);
  const stopRanges = allocateStopDates(intent);
  const dayNotes = buildItineraryDayNotes(intent, stopRanges);
  return {
    intent,
    stopRanges,
    dayNotes,
    tripName: deriveTripName(intent),
    destination: deriveTripDestination(intent),
  };
}
