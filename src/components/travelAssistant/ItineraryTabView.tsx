"use client";

import { useEffect, useRef, useState } from "react";
import { ItineraryTimeline } from "@/components/travelAssistant/ItineraryTimeline";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { TripLegCalendar } from "@/components/travelAssistant/TripLegCalendar";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";
import type { DayPlanRecord, ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import type { PlanSubView } from "@/lib/travelAssistant/consumerTabs";

interface ItineraryTabViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  missingPriceCount?: number;
  onReviewPricing?: () => void;
  reservations: {
    id: string;
    type: string;
    title: string;
    provider: string;
    localTime: string;
    flightNumber?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDepartureTime?: string;
    flightDate?: string;
    checkOutDate?: string;
    location?: string;
    confirmationCode?: string;
    flightAirline?: string;
  }[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  planSubView: PlanSubView;
  onPlanSubViewChange: (view: PlanSubView) => void;
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  scrollToDateKey?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onHighlightedLegIdChange?: (legId: string | null) => void;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onSaveDayPlan: (dateKey: string, plan: DayPlanRecord, fallbackLocation: string) => void;
  onApplyHotelToDays: (
    dateKeys: string[],
    hotel: Pick<DayPlanRecord, "hotelName" | "hotelConfirmation" | "hotelBooked">,
    fallbackLocation: string,
  ) => void;
  onSaveLegLabel: (legId: string, label: string) => void;
  getDayPlan: (dateKey: string, fallbackLocation: string) => DayPlanRecord;
  itineraryPlans: ItineraryPlansData;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onGapActionTap?: (tab: string) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  onShareLink: () => void;
  missionItems?: TripActionItem[];
  onMissionAction?: (item: TripActionItem) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

export function ItineraryTabView({
  tripName,
  tripStartDate,
  tripEndDate,
  missingPriceCount = 0,
  onReviewPricing,
  reservations,
  dayNotes,
  planSubView,
  onPlanSubViewChange,
  selectedDateKey,
  highlightedLegId,
  scrollToDateKey,
  onSelectedDateKeyChange,
  onHighlightedLegIdChange,
  onDayNoteChange,
  onSaveDayPlan,
  onApplyHotelToDays,
  onSaveLegLabel,
  getDayPlan,
  itineraryPlans,
  onPlanDay,
  onGapActionTap,
  onPrint,
  onExportPdf,
  onShareLink,
  missionItems = [],
  onMissionAction,
  onPlanHotel,
}: ItineraryTabViewProps) {
  const hasTripDates = Boolean(tripStartDate && tripEndDate);
  const [planSavedFlash, setPlanSavedFlash] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToDateKey || planSubView !== "timeline" || !timelineRef.current) return;
    timelineRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToDateKey, planSubView]);

  useEffect(() => {
    if (!planSavedFlash) return;
    const timer = window.setTimeout(() => setPlanSavedFlash(false), 2000);
    return () => window.clearTimeout(timer);
  }, [planSavedFlash]);

  const handleDayNoteChange = (dateKey: string, value: string): void => {
    onDayNoteChange(dateKey, value);
    setPlanSavedFlash(true);
  };

  const handleCalendarJumpToTimeline = (dateKey: string): void => {
    onSelectedDateKeyChange?.(dateKey);
    onPlanSubViewChange("timeline");
  };

  return (
    <section
      className="relative space-y-3 bg-white"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      }}
    >
      <TripHealthStrip
        reservations={reservations.map((reservation) => ({
          ...reservation,
          location: reservation.location ?? "",
        }))}
        missingPriceCount={missingPriceCount}
        onGapActionTap={onGapActionTap}
        onReviewPricing={onReviewPricing}
      />

      <header className="rounded-2xl bg-[#0F1923] px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Plan</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{tripName}</h1>
        {hasTripDates ? (
          <p className="mt-1 text-sm text-slate-300">
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
            className="rounded-xl bg-[#f4c95d] px-3 py-1.5 text-[11px] font-extrabold text-[#1D1D1F]"
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

      <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => onPlanSubViewChange("timeline")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            planSubView === "timeline"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Timeline
        </button>
        <button
          type="button"
          onClick={() => onPlanSubViewChange("calendar")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            planSubView === "calendar"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Calendar
        </button>
      </div>

      {planSubView === "timeline" ? (
        <div ref={timelineRef}>
          <ItineraryTimeline
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            reservations={reservations}
            dayNotes={dayNotes}
            selectedDateKey={selectedDateKey}
            highlightedLegId={highlightedLegId}
            scrollToDateKey={scrollToDateKey}
            onSelectedDateKeyChange={onSelectedDateKeyChange}
            onDayNoteChange={handleDayNoteChange}
            onReservationTap={() => undefined}
            onPlanDay={onPlanDay}
            onPlanHotel={onPlanHotel}
            missionItems={missionItems}
            onMissionAction={onMissionAction}
            suppressPlanningAlerts
          />
        </div>
      ) : (
        <TripLegCalendar
          tripName={tripName}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          reservations={reservations.map((reservation) => ({
            ...reservation,
            location: reservation.location ?? "",
            confirmationCode: reservation.confirmationCode ?? "",
          }))}
          itineraryPlans={itineraryPlans}
          dayNotes={dayNotes}
          onDayNoteChange={handleDayNoteChange}
          selectedDateKey={selectedDateKey}
          highlightedLegId={highlightedLegId}
          onSelectedDateKeyChange={onSelectedDateKeyChange}
          onHighlightedLegIdChange={onHighlightedLegIdChange}
          onScrollToTimelineDate={handleCalendarJumpToTimeline}
          onPlanHotel={onPlanHotel}
        />
      )}
    </section>
  );
}
