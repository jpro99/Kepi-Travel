"use client";

import { useCallback, useEffect, useState } from "react";
import { GapAlerts } from "@/components/travelAssistant/GapAlerts";
import { ItinerarySpreadsheet } from "@/components/travelAssistant/ItinerarySpreadsheet";
import { TripTimeline } from "@/components/travelAssistant/TripTimeline";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";

export type ItineraryViewMode = "list" | "cards";

interface TripItineraryPanelProps {
  tripId?: string | null;
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  tripDaysAway: number | null;
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
    sourceEmailId?: string;
    sourceEmailSubject?: string;
    originalEmailText?: string;
    hasPdfAttachment?: boolean;
    manageUrl?: string;
    sourceLinks?: Array<{ label: string; url: string; kind: string }>;
    flightAirline?: string;
  }[];
  dayNotes: Record<string, string>;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  viewMode: ItineraryViewMode;
  onViewModeChange: (mode: ItineraryViewMode) => void;
  onClose: () => void;
  onReservationTap: (id: string) => void;
  onGapActionTap?: (tab: string) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  onShareLink: () => void;
}

export function TripItineraryPanel({
  tripId,
  tripName,
  tripStartDate,
  tripEndDate,
  tripDaysAway,
  reservations,
  dayNotes,
  onDayNoteChange,
  onPlanDay,
  viewMode,
  onViewModeChange,
  onClose,
  onReservationTap,
  onGapActionTap,
  onPrint,
  onExportPdf,
  onShareLink,
}: TripItineraryPanelProps) {
  const hasTripDates = Boolean(tripStartDate && tripEndDate);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Itinerary</p>
            <h2 className="truncate text-base font-black text-slate-900 dark:text-white">{tripName}</h2>
            {hasTripDates ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {tripStartDate} → {tripEndDate}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[10px] font-bold dark:border-slate-700">
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "list" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("cards")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "cards" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Cards
            </button>
          </div>
          <button type="button" onClick={onPrint} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold dark:border-slate-700">
            Print
          </button>
          <button type="button" onClick={onShareLink} className="rounded-lg border border-sky-200 px-2 py-1 text-[10px] font-bold text-sky-800 dark:border-sky-700 dark:text-sky-200">
            Phone
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {hasTripDates || reservations.length > 0 ? (
          viewMode === "list" ? (
            <ItinerarySpreadsheet
              tripId={tripId}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              reservations={reservations}
              dayNotes={dayNotes}
              onDayNoteChange={onDayNoteChange}
              onReservationTap={onReservationTap}
              onPlanDay={onPlanDay}
            />
          ) : (
            <TripTimeline
              reservations={reservations}
              tripName={tripName}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              tripDaysAway={tripDaysAway}
              onReservationTap={onReservationTap}
              showAllTripDays={hasTripDates}
              compact
              tripId={tripId}
              suppressMidTripBanner
            />
          )
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white">Set trip dates to start planning</p>
            <p className="mt-1 text-xs">Type plans per day — e.g. &quot;Leave Dolomites, go to Bari&quot;</p>
          </div>
        )}

        <div className="mt-3">
          <GapAlerts reservations={reservations} revealMode="collapsed" onActionTap={onGapActionTap} />
        </div>
      </div>
    </div>
  );
}

export function useItineraryPanelPrefs(tripId: string | null) {
  const [viewMode, setViewMode] = useState<ItineraryViewMode>("list");
  const [panelWidth, setPanelWidth] = useState(420);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedView = window.localStorage.getItem("kepi:itinerary-view-mode");
    if (storedView === "list" || storedView === "cards") setViewMode(storedView);
    const storedWidth = Number(window.localStorage.getItem("kepi:itinerary-panel-width"));
    if (Number.isFinite(storedWidth) && storedWidth >= 300) setPanelWidth(storedWidth);
  }, []);

  useEffect(() => {
    if (!tripId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`kepi:day-notes:${tripId}`);
      if (raw) setDayNotes(JSON.parse(raw) as Record<string, string>);
    } catch {
      setDayNotes({});
    }
  }, [tripId]);

  const persistViewMode = (mode: ItineraryViewMode): void => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.localStorage.setItem("kepi:itinerary-view-mode", mode);
  };

  const persistPanelWidth = (width: number): void => {
    setPanelWidth(width);
    if (typeof window !== "undefined") window.localStorage.setItem("kepi:itinerary-panel-width", String(width));
  };

  const updateDayNote = (dateKey: string, value: string): void => {
    setDayNotes((prev) => {
      const next = { ...prev, [dateKey]: value };
      if (tripId && typeof window !== "undefined") {
        window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const replaceDayNotes = useCallback(
    (notes: Record<string, string>): void => {
      setDayNotes(notes);
      if (tripId && typeof window !== "undefined") {
        window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(notes));
      }
    },
    [tripId],
  );

  return {
    viewMode,
    setViewMode: persistViewMode,
    panelWidth,
    setPanelWidth: persistPanelWidth,
    dayNotes,
    updateDayNote,
    replaceDayNotes,
  };
}
