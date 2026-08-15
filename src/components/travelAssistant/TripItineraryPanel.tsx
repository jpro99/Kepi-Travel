"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GapAlerts } from "@/components/travelAssistant/GapAlerts";
import { ItineraryBriefView } from "@/components/travelAssistant/ItineraryBriefView";
import { ItinerarySpreadsheet } from "@/components/travelAssistant/ItinerarySpreadsheet";
import { TripCalendarView } from "@/components/travelAssistant/TripCalendarView";
import { TripTimeline } from "@/components/travelAssistant/TripTimeline";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { FlightSearchPlan, PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import {
  dayPlanToNote,
  emptyItineraryPlans,
  mergeDayPlan,
  mergeItineraryPlansPreferExistingNotes,
  normalizeItineraryPlans,
  parseDayPlanFromNote,
  type DayPlanRecord,
  type ItineraryPlansData,
} from "@/lib/travelAssistant/itineraryDayPlan";
import {
  applyDayPlanToItineraryPlans,
  type ParsedDayPlanItinerary,
} from "@/lib/travelAssistant/parseDayPlanItinerary";
import {
  reconcilePlanNoteWithHotels,
  type ReconcilePlanNoteResult,
} from "@/lib/travelAssistant/reconcilePlanNoteWithHotels";
import type { TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";

const TRIP_API_ROUTE = "/api/trips";

export type ItineraryViewMode = "edit" | "brief" | "cards" | "calendar";

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
  stopRanges?: StopDateRange[];
  onDayNoteChange: (dateKey: string, value: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  viewMode: ItineraryViewMode;
  onViewModeChange: (mode: ItineraryViewMode) => void;
  onClose: () => void;
  onReservationTap: (id: string) => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  onShareLink: () => void;
  plannedStayCities?: PlannedStayCity[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  onSearchFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onOpenHotelsTab?: () => void;
  onOpenFlightsTab?: () => void;
}

export function TripItineraryPanel({
  tripId,
  tripName,
  tripStartDate,
  tripEndDate,
  tripDaysAway,
  reservations,
  dayNotes,
  stopRanges = [],
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
  plannedStayCities = [],
  plannedFlightLegs = [],
  onPickPlannedCity,
  onSearchFlights,
  onOpenHotelsTab,
  onOpenFlightsTab,
}: TripItineraryPanelProps) {
  const hasTripDates = Boolean(tripStartDate && tripEndDate);
  const [planSavedFlash, setPlanSavedFlash] = useState(false);

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
              onClick={() => onViewModeChange("edit")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "edit" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("brief")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "brief" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Brief
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("cards")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "cards" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("calendar")}
              className={`rounded-md px-2.5 py-1 ${viewMode === "calendar" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              Calendar
            </button>
          </div>
          <button type="button" onClick={onPrint} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold dark:border-slate-700">
            Print
          </button>
          <button type="button" onClick={onShareLink} className="rounded-lg border border-sky-200 px-2 py-1 text-[10px] font-bold text-sky-800 dark:border-sky-700 dark:text-sky-200">
            Phone
          </button>
          {viewMode === "edit" || viewMode === "calendar" ? (
            <span
              className={`text-[10px] font-semibold ${
                planSavedFlash ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {planSavedFlash ? "Saved on this device ✓" : "Auto-saves as you type"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {hasTripDates || reservations.length > 0 ? (
          viewMode === "edit" ? (
            <ItinerarySpreadsheet
              tripId={tripId}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              reservations={reservations}
              dayNotes={dayNotes}
              stopRanges={stopRanges}
              onDayNoteChange={handleDayNoteChange}
              onReservationTap={onReservationTap}
              onPlanDay={onPlanDay}
            />
          ) : viewMode === "brief" ? (
            <ItineraryBriefView
              tripName={tripName}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              tripId={tripId}
              reservations={reservations}
              dayNotes={dayNotes}
              stopRanges={stopRanges}
              onReservationTap={onReservationTap}
            />
          ) : viewMode === "calendar" ? (
            <TripCalendarView
              reservations={reservations}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              tripName={tripName}
              dayNotes={dayNotes}
              stopRanges={stopRanges}
              onDayNoteChange={handleDayNoteChange}
              onReservationTap={onReservationTap}
              onPlanDay={onPlanDay}
              plannedStayCities={plannedStayCities}
              plannedFlightLegs={plannedFlightLegs}
              onPickCity={onPickPlannedCity}
              onSearchFlights={onSearchFlights}
              onOpenHotelsTab={onOpenHotelsTab}
              onOpenFlightsTab={onOpenFlightsTab}
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
  const [viewMode, setViewMode] = useState<ItineraryViewMode>("edit");
  const [panelWidth, setPanelWidth] = useState(420);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [hotelNotebookNote, setHotelNotebookNote] = useState("");
  const [itineraryPlans, setItineraryPlans] = useState<ItineraryPlansData>(emptyItineraryPlans());
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedView = window.localStorage.getItem("kepi:itinerary-view-mode");
    if (storedView === "edit" || storedView === "brief" || storedView === "cards" || storedView === "calendar" || storedView === "list") {
      setViewMode(storedView === "list" ? "edit" : storedView);
    }
    const storedWidth = Number(window.localStorage.getItem("kepi:itinerary-panel-width"));
    if (Number.isFinite(storedWidth) && storedWidth >= 300) setPanelWidth(storedWidth);
  }, []);

  useEffect(() => {
    if (!tripId || typeof window === "undefined") {
      setDayNotes({});
      setHotelNotebookNote("");
      setItineraryPlans(emptyItineraryPlans());
      return;
    }
    try {
      const rawNotes = window.localStorage.getItem(`kepi:day-notes:${tripId}`);
      if (rawNotes) setDayNotes(JSON.parse(rawNotes) as Record<string, string>);
      else setDayNotes({});
      const hotelRaw = window.localStorage.getItem(`kepi:hotel-notebook:${tripId}`);
      if (hotelRaw) setHotelNotebookNote(hotelRaw);
      else setHotelNotebookNote("");
      const rawPlans = window.localStorage.getItem(`kepi:itinerary-plans:${tripId}`);
      if (rawPlans) setItineraryPlans(normalizeItineraryPlans(JSON.parse(rawPlans)));
      else setItineraryPlans(emptyItineraryPlans());
    } catch {
      setDayNotes({});
      setHotelNotebookNote("");
      setItineraryPlans(emptyItineraryPlans());
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

  const queuePersistToTrip = useCallback(
    (nextPlans: ItineraryPlansData, nextNotes: Record<string, string>): void => {
      if (!tripId || typeof window === "undefined") return;
      window.localStorage.setItem(`kepi:itinerary-plans:${tripId}`, JSON.stringify(nextPlans));
      window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(nextNotes));
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        void fetch(TRIP_API_ROUTE, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: tripId,
            patch: { itineraryPlans: nextPlans },
          }),
        }).catch(() => undefined);
      }, 400);
    },
    [tripId],
  );

  const hydrateFromTrip = useCallback(
    (raw: unknown): void => {
      if (!tripId || !raw) return;
      const normalized = normalizeItineraryPlans(raw);
      setItineraryPlans((local) => {
        const merged = mergeItineraryPlansPreferExistingNotes(local, normalized, {
          fillEmptyDays: true,
        });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`kepi:itinerary-plans:${tripId}`, JSON.stringify(merged));
        }
        setDayNotes((prev) => {
          const next = { ...prev };
          for (const [dateKey, plan] of Object.entries(merged.dayPlans) as Array<
            [string, DayPlanRecord]
          >) {
            if (plan.notes.trim()) next[dateKey] = dayPlanToNote(plan);
          }
          if (typeof window !== "undefined") {
            window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(next));
          }
          return next;
        });
        return merged;
      });
    },
    [tripId],
  );

  const updateDayNote = (dateKey: string, value: string): void => {
    setDayNotes((prev) => {
      const next = { ...prev, [dateKey]: value };
      if (tripId && typeof window !== "undefined") {
        window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const applyReconciledPlans = useCallback(
    (result: ReconcilePlanNoteResult): void => {
      setItineraryPlans((prev) => {
        const next: ItineraryPlansData = {
          ...prev,
          dayPlans: result.dayPlans,
          updatedAt: new Date().toISOString(),
        };
        setDayNotes(result.dayNotes);
        if (tripId && typeof window !== "undefined") {
          window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(result.dayNotes));
        }
        queuePersistToTrip(next, result.dayNotes);
        return next;
      });
    },
    [queuePersistToTrip, tripId],
  );

  const reconcileDayNote = useCallback(
    (args: {
      dateKey: string;
      value: string;
      tripStartDate: string;
      tripEndDate: string;
      hotels: Array<{
        id: string;
        type: string;
        title?: string;
        provider?: string;
        location?: string;
        localTime?: string;
        checkOutDate?: string;
        confirmationCode?: string | null;
      }>;
      inferredStayCity?: string | null;
    }): string | null => {
      const result = reconcilePlanNoteWithHotels({
        dateKey: args.dateKey,
        note: args.value,
        tripStartDate: args.tripStartDate,
        tripEndDate: args.tripEndDate,
        dayNotes: { ...dayNotes, [args.dateKey]: args.value },
        dayPlans: itineraryPlans.dayPlans,
        hotels: args.hotels,
        inferredStayCity: args.inferredStayCity,
      });
      if (result.applied) {
        applyReconciledPlans(result);
        return result.summary;
      }
      updateDayNote(args.dateKey, args.value);
      return null;
    },
    [applyReconciledPlans, dayNotes, itineraryPlans.dayPlans],
  );

  const saveDayPlan = useCallback(
    (dateKey: string, plan: DayPlanRecord, fallbackLocation: string): void => {
      const merged = { ...mergeDayPlan(undefined, fallbackLocation), ...plan };
      setItineraryPlans((prev) => {
        const next: ItineraryPlansData = {
          ...prev,
          dayPlans: { ...prev.dayPlans, [dateKey]: merged },
          updatedAt: new Date().toISOString(),
        };
        setDayNotes((notesPrev) => {
          const nextNotes = { ...notesPrev, [dateKey]: dayPlanToNote(merged) };
          queuePersistToTrip(next, nextNotes);
          return nextNotes;
        });
        return next;
      });
    },
    [queuePersistToTrip],
  );

  const applyHotelToDays = useCallback(
    (dateKeys: string[], hotel: Pick<DayPlanRecord, "hotelName" | "hotelConfirmation" | "hotelBooked">, fallbackLocation: string): void => {
      setItineraryPlans((prev) => {
        const dayPlans = { ...prev.dayPlans };
        for (const dateKey of dateKeys) {
          const existing = dayPlans[dateKey] ?? mergeDayPlan(undefined, fallbackLocation);
          dayPlans[dateKey] = {
            ...existing,
            hotelName: hotel.hotelName,
            hotelConfirmation: hotel.hotelConfirmation,
            hotelBooked: hotel.hotelBooked,
          };
        }
        const next: ItineraryPlansData = { ...prev, dayPlans, updatedAt: new Date().toISOString() };
        setDayNotes((notesPrev) => {
          const nextNotes = { ...notesPrev };
          for (const dateKey of dateKeys) {
            nextNotes[dateKey] = dayPlanToNote(dayPlans[dateKey]!);
          }
          queuePersistToTrip(next, nextNotes);
          return nextNotes;
        });
        return next;
      });
    },
    [queuePersistToTrip],
  );

  const saveLegLabelOverride = useCallback(
    (legId: string, label: string): void => {
      setItineraryPlans((prev) => {
        const next: ItineraryPlansData = {
          ...prev,
          legLabelOverrides: { ...prev.legLabelOverrides, [legId]: label.trim() },
          updatedAt: new Date().toISOString(),
        };
        queuePersistToTrip(next, dayNotes);
        return next;
      });
    },
    [dayNotes, queuePersistToTrip],
  );

  const getDayPlan = useCallback(
    (dateKey: string, fallbackLocation: string): DayPlanRecord => {
      const stored = itineraryPlans.dayPlans[dateKey];
      if (stored) return stored;
      const note = dayNotes[dateKey];
      if (note?.trim()) return parseDayPlanFromNote(note, fallbackLocation);
      return mergeDayPlan(undefined, fallbackLocation);
    },
    [dayNotes, itineraryPlans.dayPlans],
  );

  const applyImportedDayPlan = useCallback(
    (parsed: ParsedDayPlanItinerary): number => {
      const applied = applyDayPlanToItineraryPlans(itineraryPlans, parsed);
      setItineraryPlans(applied.plans);
      setDayNotes((prev) => {
        const next = { ...prev, ...applied.dayNotes };
        queuePersistToTrip(applied.plans, next);
        return next;
      });
      return applied.daysApplied;
    },
    [itineraryPlans, queuePersistToTrip],
  );

  const replaceDayNotes = useCallback(
    (notes: Record<string, string>): void => {
      setDayNotes(notes);
      if (tripId && typeof window !== "undefined") {
        window.localStorage.setItem(`kepi:day-notes:${tripId}`, JSON.stringify(notes));
      }
    },
    [tripId],
  );

  const updateHotelNotebookNote = (value: string): void => {
    setHotelNotebookNote(value);
    if (tripId && typeof window !== "undefined") {
      window.localStorage.setItem(`kepi:hotel-notebook:${tripId}`, value);
    }
  };

  return {
    viewMode,
    setViewMode: persistViewMode,
    panelWidth,
    setPanelWidth: persistPanelWidth,
    dayNotes,
    updateDayNote,
    reconcileDayNote,
    applyReconciledPlans,
    replaceDayNotes,
    applyImportedDayPlan,
    hotelNotebookNote,
    updateHotelNotebookNote,
    itineraryPlans,
    hydrateFromTrip,
    saveDayPlan,
    applyHotelToDays,
    saveLegLabelOverride,
    getDayPlan,
  };
}
