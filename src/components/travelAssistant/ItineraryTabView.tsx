"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { NarrativeDayPlanView } from "@/components/travelAssistant/NarrativeDayPlanView";
import { TripCompletenessBar } from "@/components/travelAssistant/TripCompletenessBar";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { TripLegCalendar } from "@/components/travelAssistant/TripLegCalendar";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";
import type { DayPlanRecord, ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import { InterCityTransportPrompts } from "@/components/travelAssistant/InterCityTransportPrompts";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { PlanSubView } from "@/lib/travelAssistant/consumerTabs";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";
import type { TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";
import { sanitizeTravelerNotes } from "@/lib/travelAssistant/sanitizeTravelerNotes";
import {
  addIsoDays,
  buildTripCompleteness,
} from "@/lib/travelAssistant/tripNightCoverage";

interface ItineraryTabViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  missingPriceCount?: number;
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  onReviewPricing?: () => void;
  onSkipPreDepartureNight?: (flightDay: string) => void;
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
    flightArrivalTime?: string;
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
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  /** Microsoft Excel workbook (.xls SpreadsheetML). */
  onExportExcel?: () => void;
  /** Friend-share narrative day-plan PDF (Puglia-style letter). */
  onExportDayPlanPdf?: () => void;
  onShareLink: () => void;
  missionItems?: TripActionItem[];
  onMissionAction?: (item: TripActionItem) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
  plannedFlightLegs?: PlannedFlightLeg[];
  onSearchMissingFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onQuickGroundTransport?: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
  onReservationTap?: (id: string) => void;
}

export function ItineraryTabView({
  tripName,
  tripStartDate,
  tripEndDate,
  missingPriceCount = 0,
  stayDecisions,
  onReviewPricing,
  onSkipPreDepartureNight,
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
  // Day-plan sheet hooks retained for calendar / future Plan actions (I28 timeline uses notes only).
  onSaveDayPlan: _onSaveDayPlan,
  onApplyHotelToDays: _onApplyHotelToDays,
  onSaveLegLabel: _onSaveLegLabel,
  getDayPlan: _getDayPlan,
  itineraryPlans,
  onPlanDay: _onPlanDay,
  onGapActionTap,
  onPrint,
  onExportPdf,
  onExportExcel,
  onExportDayPlanPdf,
  onShareLink,
  missionItems: _missionItems = [],
  onMissionAction: _onMissionAction,
  onPlanHotel,
  plannedFlightLegs = [],
  onSearchMissingFlights,
  onQuickGroundTransport,
  onReservationTap,
}: ItineraryTabViewProps) {
  const tNav = useTranslations("ConsumerNav");
  const tPlan = useTranslations("PlanTab");
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
    onDayNoteChange(dateKey, sanitizeTravelerNotes(value));
    setPlanSavedFlash(true);
  };

  const handleCalendarJumpToTimeline = (dateKey: string): void => {
    onSelectedDateKeyChange?.(dateKey);
    onPlanSubViewChange("timeline");
  };

  const completeness = useMemo(
    () =>
      buildTripCompleteness({
        reservations,
        stayDecisions,
        tripStartDate,
        tripEndDate,
      }),
    [reservations, stayDecisions, tripStartDate, tripEndDate],
  );

  return (
    <section
      className="relative space-y-3 bg-white"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      }}
    >
      <TripCompletenessBar
        completeness={completeness}
        onOpenPlan={() => onPlanSubViewChange("timeline")}
        onFindStayForGap={(gap) => {
          if (onGapActionTap) {
            onGapActionTap({
              tab: "reservations",
              context: {
                kind: "hotel",
                city: gap.suggestedCity,
                checkIn: gap.startNight,
                checkOut: addIsoDays(gap.endNight, 1),
              },
            });
            return;
          }
          onPlanHotel?.(gap.startNight, gap.suggestedCity);
        }}
      />

      <TripHealthStrip
        reservations={reservations.map((reservation) => ({
          ...reservation,
          location: reservation.location ?? "",
        }))}
        missingPriceCount={missingPriceCount}
        stayDecisions={stayDecisions}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        onGapActionTap={onGapActionTap}
        onReviewPricing={onReviewPricing}
        onSkipPreDepartureNight={onSkipPreDepartureNight}
      />

      {plannedFlightLegs.length > 0 && onSearchMissingFlights && onQuickGroundTransport ? (
        <InterCityTransportPrompts
          legs={plannedFlightLegs}
          onSearchFlights={onSearchMissingFlights}
          onQuickGroundTransport={onQuickGroundTransport}
        />
      ) : null}

      <header className="rounded-2xl bg-[#0F1923] px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">{tNav("planTab")}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{tripName}</h1>
        {hasTripDates ? (
          <p className="mt-1 text-sm text-slate-300">
            {tripStartDate} → {tripEndDate}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">{tPlan("setDatesHint")}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            {tPlan("print")}
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            {tPlan("pdf")}
          </button>
          {onExportExcel ? (
            <button
              type="button"
              onClick={onExportExcel}
              className="rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              {tPlan("excel")}
            </button>
          ) : null}
          {onExportDayPlanPdf ? (
            <button
              type="button"
              onClick={onExportDayPlanPdf}
              className="rounded-xl border border-[#f4c95d]/50 px-3 py-1.5 text-[11px] font-semibold text-[#f4c95d] hover:bg-white/10"
            >
              Day plan PDF
            </button>
          ) : null}
          <button
            type="button"
            onClick={onShareLink}
            className="rounded-xl bg-[#f4c95d] px-3 py-1.5 text-[11px] font-extrabold text-[#1D1D1F]"
          >
            {tPlan("share")}
          </button>
          <span
            className={`self-center text-[10px] font-semibold ${
              planSavedFlash ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            {planSavedFlash ? tPlan("savedFlash") : tPlan("autoSaveHint")}
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
          {tNav("timeline")}
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
          {tNav("calendar")}
        </button>
      </div>

      {planSubView === "timeline" ? (
        <div ref={timelineRef}>
          <NarrativeDayPlanView
            tripName={tripName}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            reservations={reservations}
            dayNotes={dayNotes}
            itineraryPlans={itineraryPlans}
            onDayNoteChange={handleDayNoteChange}
            onReservationTap={onReservationTap}
            selectedDateKey={selectedDateKey ?? scrollToDateKey}
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
