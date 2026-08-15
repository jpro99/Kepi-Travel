"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { NarrativeDayPlanView } from "@/components/travelAssistant/NarrativeDayPlanView";
import { TripCompletenessBar } from "@/components/travelAssistant/TripCompletenessBar";
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
    notes?: string;
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

function formatHumanTripRange(start: string | null | undefined, end: string | null | undefined): string {
  const fmt = (key: string): string => {
    const ms = Date.parse(`${key.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(ms)) return key.slice(0, 10);
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  if (!start || !end) return "";
  return `${fmt(start)} – ${fmt(end)}`;
}

export function ItineraryTabView({
  tripName,
  tripStartDate,
  tripEndDate,
  missingPriceCount: _missingPriceCount = 0,
  stayDecisions,
  onReviewPricing: _onReviewPricing,
  onSkipPreDepartureNight: _onSkipPreDepartureNight,
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
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
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

  const dateLabel = formatHumanTripRange(tripStartDate, tripEndDate);

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

      {plannedFlightLegs.length > 0 && onSearchMissingFlights && onQuickGroundTransport ? (
        <InterCityTransportPrompts
          legs={plannedFlightLegs}
          onSearchFlights={onSearchMissingFlights}
          onQuickGroundTransport={onQuickGroundTransport}
        />
      ) : null}

      <header className="rounded-2xl bg-[#F5F5F7] px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
              {tNav("planTab")}
            </p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1D1D1F]">{tripName}</h1>
            {hasTripDates ? (
              <p className="mt-1 text-[15px] text-[#6E6E73]">{dateLabel}</p>
            ) : (
              <p className="mt-1 text-[15px] text-[#6E6E73]">{tPlan("setDatesHint")}</p>
            )}
            <p
              className={`mt-2 text-[12px] font-semibold ${
                planSavedFlash ? "text-[#248A3D]" : "text-[#AEAEB2]"
              }`}
            >
              {planSavedFlash ? tPlan("savedFlash") : tPlan("autoSaveHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShareSheetOpen(true)}
            className="min-h-[44px] shrink-0 rounded-full bg-white px-4 text-[15px] font-semibold text-[#007AFF] shadow-sm"
          >
            Share
          </button>
        </div>
      </header>

      {shareSheetOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-6">
          <div className="w-full rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Share & export
                </p>
                <h3 className="mt-1 text-[22px] font-semibold text-[#1D1D1F]">{tripName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShareSheetOpen(false)}
                className="min-h-[44px] rounded-full px-3 text-[15px] font-semibold text-[#007AFF]"
              >
                Close
              </button>
            </header>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShareSheetOpen(false);
                  onShareLink();
                }}
                className="flex min-h-[52px] w-full items-center rounded-2xl bg-[#007AFF] px-4 text-[16px] font-semibold text-white"
              >
                {tPlan("share")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareSheetOpen(false);
                  onPrint();
                }}
                className="flex min-h-[52px] w-full items-center rounded-2xl bg-[#F5F5F7] px-4 text-[16px] font-semibold text-[#1D1D1F]"
              >
                {tPlan("print")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareSheetOpen(false);
                  onExportPdf();
                }}
                className="flex min-h-[52px] w-full items-center rounded-2xl bg-[#F5F5F7] px-4 text-[16px] font-semibold text-[#1D1D1F]"
              >
                {tPlan("pdf")}
              </button>
              {onExportExcel ? (
                <button
                  type="button"
                  onClick={() => {
                    setShareSheetOpen(false);
                    onExportExcel();
                  }}
                  className="flex min-h-[52px] w-full items-center rounded-2xl bg-[#F5F5F7] px-4 text-[16px] font-semibold text-[#1D1D1F]"
                >
                  {tPlan("excel")}
                </button>
              ) : null}
              {onExportDayPlanPdf ? (
                <button
                  type="button"
                  onClick={() => {
                    setShareSheetOpen(false);
                    onExportDayPlanPdf();
                  }}
                  className="flex min-h-[52px] w-full items-center rounded-2xl bg-[#F5F5F7] px-4 text-[16px] font-semibold text-[#1D1D1F]"
                >
                  Day plan PDF
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex rounded-2xl bg-[#F5F5F7] p-1">
        <button
          type="button"
          onClick={() => onPlanSubViewChange("timeline")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            planSubView === "timeline" ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73]"
          }`}
        >
          {tNav("timeline")}
        </button>
        <button
          type="button"
          onClick={() => onPlanSubViewChange("calendar")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            planSubView === "calendar" ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73]"
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
