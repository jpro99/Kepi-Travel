"use client";

import { useEffect, useState } from "react";
import { ItineraryTimeline } from "@/components/travelAssistant/ItineraryTimeline";
import { ItineraryMissionCards } from "@/components/travelAssistant/ItineraryMissionCards";
import { ItinerarySlideBanners } from "@/components/travelAssistant/ItinerarySlideBanners";
import { TripCalendarView } from "@/components/travelAssistant/TripCalendarView";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { FlightSearchPlan, PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";

interface ItineraryTabViewProps {
  tripId?: string | null;
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: {
    id: string;
    type: string;
    title: string;
    provider: string;
    localTime: string;
    timezone?: string;
    location: string;
    confirmationCode: string;
    flightNumber?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDepartureTime?: string;
    flightArrivalTime?: string;
    flightDate?: string;
    checkOutDate?: string;
    notes?: string;
    flightAirline?: string;
  }[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  onDayNoteChange: (dateKey: string, value: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onReservationTap: (id: string) => void;
  onGapActionTap?: (tab: string) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  onShareLink: () => void;
  plannedStayCities?: PlannedStayCity[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  onSearchFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onOpenHotelsTab?: () => void;
  onOpenFlightsTab?: () => void;
  missionItems?: TripActionItem[];
  onMissionAction?: (item: TripActionItem) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

export function ItineraryTabView({
  tripName,
  tripStartDate,
  tripEndDate,
  reservations,
  dayNotes,
  stopRanges = [],
  onDayNoteChange,
  onPlanDay,
  onReservationTap,
  onGapActionTap,
  onPrint,
  onExportPdf,
  onShareLink,
  plannedStayCities = [],
  plannedFlightLegs = [],
  onPickPlannedCity,
  onSearchFlights,
  onOpenHotelsTab,
  onOpenFlightsTab,
  missionItems = [],
  onMissionAction,
  onPlanHotel,
}: ItineraryTabViewProps) {
  const hasTripDates = Boolean(tripStartDate && tripEndDate);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(tripStartDate?.slice(0, 10) ?? null);
  const [planSavedFlash, setPlanSavedFlash] = useState(false);

  useEffect(() => {
    if (tripStartDate && !selectedDateKey) {
      setSelectedDateKey(tripStartDate.slice(0, 10));
    }
  }, [tripStartDate, selectedDateKey]);

  useEffect(() => {
    if (!planSavedFlash) return;
    const timer = window.setTimeout(() => setPlanSavedFlash(false), 2000);
    return () => window.clearTimeout(timer);
  }, [planSavedFlash]);

  const handleDayNoteChange = (dateKey: string, value: string): void => {
    onDayNoteChange(dateKey, value);
    setPlanSavedFlash(true);
  };

  return (
    <section className="relative space-y-4">
      <ItinerarySlideBanners reservations={reservations} onActionTap={onGapActionTap} />

      <header className="rounded-3xl bg-[#0F1923] px-5 py-5 shadow-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Itinerary</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">{tripName}</h1>
        {hasTripDates ? (
          <p className="mt-1 text-sm font-normal text-slate-300">
            {tripStartDate} → {tripEndDate}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Set dates on Trip to unlock your timeline</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={onShareLink}
            className="rounded-xl bg-[#f4c95d] px-3 py-1.5 text-[11px] font-extrabold text-[#0F1923]"
          >
            Share
          </button>
          <span
            className={`self-center text-[10px] font-semibold ${
              planSavedFlash ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            {planSavedFlash ? "Saved ✓" : "Auto-saves as you type"}
          </span>
        </div>
      </header>

      {missionItems.length > 0 && onMissionAction ? (
        <ItineraryMissionCards items={missionItems} onAction={onMissionAction} />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
        <div className="min-w-0 rounded-3xl bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-black/[0.04] dark:bg-[#0F1923]/40 dark:ring-white/[0.06] lg:p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Day by day
          </p>
          <ItineraryTimeline
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            reservations={reservations}
            dayNotes={dayNotes}
            stopRanges={stopRanges}
            selectedDateKey={selectedDateKey}
            onSelectedDateKeyChange={setSelectedDateKey}
            onDayNoteChange={handleDayNoteChange}
            onReservationTap={onReservationTap}
            onPlanDay={onPlanDay}
            onPlanHotel={onPlanHotel}
          />
        </div>

        <div className="min-w-0">
          <TripCalendarView
            reservations={reservations}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            tripName={tripName}
            dayNotes={dayNotes}
            stopRanges={stopRanges}
            selectedDateKey={selectedDateKey}
            onSelectedDateKeyChange={setSelectedDateKey}
            onReservationTap={onReservationTap}
            plannedStayCities={plannedStayCities}
            plannedFlightLegs={plannedFlightLegs}
            onPickCity={onPickPlannedCity}
            onSearchFlights={onSearchFlights}
            onOpenHotelsTab={onOpenHotelsTab}
            onOpenFlightsTab={onOpenFlightsTab}
            compact
          />
        </div>
      </div>
    </section>
  );
}
