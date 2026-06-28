"use client";

import { TripLegCalendar } from "@/components/travelAssistant/TripLegCalendar";

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
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onHighlightedLegIdChange?: (legId: string | null) => void;
  onScrollToTimeline?: (dateKey: string) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

export function CalendarTabView(props: CalendarTabViewProps) {
  return (
    <div className="w-full">
      <TripLegCalendar {...props} onScrollToTimelineDate={props.onScrollToTimeline} />
    </div>
  );
}
