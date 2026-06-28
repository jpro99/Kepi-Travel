"use client";

import { TripLegCalendar } from "@/components/travelAssistant/TripLegCalendar";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

interface CalendarTabViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: {
    id: string;
    type: string;
    title: string;
    provider: string;
    localTime: string;
    location: string;
    confirmationCode: string;
    flightNumber?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDate?: string;
    checkOutDate?: string;
  }[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onHighlightedLegIdChange?: (legId: string | null) => void;
  onScrollToTimeline?: (dateKey: string) => void;
  onReservationTap?: (id: string) => void;
  onPlanDay?: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

export function CalendarTabView({
  tripName,
  tripStartDate,
  tripEndDate,
  reservations,
  dayNotes,
  stopRanges = [],
  selectedDateKey,
  highlightedLegId,
  onSelectedDateKeyChange,
  onHighlightedLegIdChange,
  onScrollToTimeline,
  onReservationTap,
  onPlanHotel,
}: CalendarTabViewProps) {
  return (
    <TripLegCalendar
      tripName={tripName}
      tripStartDate={tripStartDate}
      tripEndDate={tripEndDate}
      reservations={reservations}
      dayNotes={dayNotes}
      stopRanges={stopRanges}
      selectedDateKey={selectedDateKey}
      highlightedLegId={highlightedLegId}
      onSelectedDateKeyChange={onSelectedDateKeyChange}
      onHighlightedLegIdChange={onHighlightedLegIdChange}
      onScrollToTimelineDate={onScrollToTimeline}
      onReservationTap={onReservationTap}
      onPlanHotel={onPlanHotel}
    />
  );
}
