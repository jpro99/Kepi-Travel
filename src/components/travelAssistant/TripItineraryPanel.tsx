"use client";

import { GapAlerts } from "@/components/travelAssistant/GapAlerts";
import { TripTimeline } from "@/components/travelAssistant/TripTimeline";

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
  }[];
  onClose: () => void;
  onReservationTap: (id: string) => void;
  onEmptyDayTap: (dateKey: string) => void;
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
  onClose,
  onReservationTap,
  onEmptyDayTap,
  onGapActionTap,
  onPrint,
  onExportPdf,
  onShareLink,
}: TripItineraryPanelProps) {
  const hasTripDates = Boolean(tripStartDate && tripEndDate);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Itinerary</p>
            <h2 className="truncate text-lg font-black text-slate-900 dark:text-white">{tripName}</h2>
            {hasTripDates ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {tripStartDate} → {tripEndDate}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
            aria-label="Close itinerary"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-950"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Save PDF
          </button>
          <button
            type="button"
            onClick={onShareLink}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
          >
            Open on phone
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {hasTripDates || reservations.length > 0 ? (
          <TripTimeline
            reservations={reservations}
            tripName={tripName}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            tripDaysAway={tripDaysAway}
            onReservationTap={onReservationTap}
            showAllTripDays={hasTripDates}
            compact
            onEmptyDayTap={onEmptyDayTap}
            tripId={tripId}
            suppressMidTripBanner
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white">Your itinerary fills in here</p>
            <p className="mt-1">Add flights and hotels — each booking appears on its day automatically.</p>
          </div>
        )}

        <div className="mt-4">
          <GapAlerts
            reservations={reservations}
            revealMode="collapsed"
            onActionTap={onGapActionTap}
          />
        </div>
      </div>
    </div>
  );
}
