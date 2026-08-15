/**
 * Recover Plan day notes from stored email text or a pasted Word itinerary (I50).
 */

import {
  normalizeItineraryPlans,
  type ItineraryPlansData,
} from "@/lib/travelAssistant/itineraryDayPlan";
import {
  applyDayPlanToItineraryPlans,
  pickDayPlanFromImportedMail,
  remapParsedDayPlanToTripWindow,
} from "@/lib/travelAssistant/parseDayPlanItinerary";

export interface DayPlanSourceText {
  subject?: string;
  body: string;
}

export function collectDayPlanSourcesFromTrip(trip: {
  reservations?: Array<{ originalEmailText?: string; sourceEmailSubject?: string }>;
  reviewQueue?: Array<{ originalEmailText?: string; sourceEmailSubject?: string }>;
}): DayPlanSourceText[] {
  const sources: DayPlanSourceText[] = [];
  for (const reservation of trip.reservations ?? []) {
    const body = reservation.originalEmailText?.trim() ?? "";
    if (!body) continue;
    sources.push({ subject: reservation.sourceEmailSubject, body });
  }
  for (const item of trip.reviewQueue ?? []) {
    const body = item.originalEmailText?.trim() ?? "";
    if (!body) continue;
    sources.push({ subject: item.sourceEmailSubject, body });
  }
  return sources;
}

export function backfillDayPlansFromSources(input: {
  existing?: ItineraryPlansData;
  sources: DayPlanSourceText[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}): { plans: ItineraryPlansData; daysApplied: number; dayNotes: Record<string, string> } {
  const parsed = pickDayPlanFromImportedMail(input.sources, {
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
  });
  if (!parsed) {
    return {
      plans: normalizeItineraryPlans(input.existing),
      daysApplied: 0,
      dayNotes: {},
    };
  }
  const remapped = remapParsedDayPlanToTripWindow(parsed, input.tripStartDate, input.tripEndDate);
  return applyDayPlanToItineraryPlans(input.existing, remapped);
}
