"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ItineraryDayEditor } from "@/components/travelAssistant/ItineraryDayEditor";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

interface ItineraryDayDrawerProps {
  open: boolean;
  dateKey: string;
  dateLabel: string;
  note: string;
  stayCity: string | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  onClose: () => void;
  onChange: (value: string) => void;
  onPlanDay?: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: () => void;
  bookedItems?: Array<{ id: string; label: string; onTap: () => void }>;
}

export function ItineraryDayDrawer({
  open,
  dateKey,
  dateLabel,
  note,
  stayCity,
  tripStartDate,
  tripEndDate,
  onClose,
  onChange,
  onPlanDay,
  onPlanHotel,
  bookedItems = [],
}: ItineraryDayDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close day editor"
        className="absolute inset-0 bg-[#0F1923]/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="itinerary-day-drawer-title"
        className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#FAFAF8] shadow-2xl dark:bg-[#0F1923] sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Edit day
          </p>
          <h2 id="itinerary-day-drawer-title" className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">
            {dateLabel}
          </h2>
          {stayCity ? (
            <p className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Staying in {stayCity}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ItineraryDayEditor
            dateKey={dateKey}
            value={note}
            stayCity={stayCity}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            onChange={onChange}
            onPlanDay={
              onPlanDay
                ? () =>
                    onPlanDay(dateKey, {
                      kind: "unknown",
                      raw: note,
                      needsTransport: false,
                      needsHotelCheckout: false,
                      needsHotelCheckin: false,
                      summary: note,
                    }, "activities")
                : undefined
            }
            onPlanHotel={onPlanHotel}
          />
          {bookedItems.length > 0 ? (
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Booked</p>
              <ul className="space-y-2">
                {bookedItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={item.onTap}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:border-[#f4c95d]/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[#0F1923] px-4 py-3 text-sm font-semibold text-white dark:bg-[#f4c95d] dark:text-[#0F1923]"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
