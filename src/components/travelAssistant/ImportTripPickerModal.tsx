"use client";

import { useEffect } from "react";
import {
  formatTripDateRange,
  formatTripListSubtitle,
  formatTripListTitle,
} from "@/lib/travelAssistant/tripListDisplay";
import type { ImportTargetTripReason, ImportTargetTripRow } from "@/lib/travelAssistant/importTargetTrip";

export interface ImportTripPickerModalProps {
  open: boolean;
  fileLabel: string;
  bookingCount: number;
  candidates: ImportTargetTripRow[];
  inferredTripName: string;
  inferredDateRange: string;
  reason: ImportTargetTripReason;
  busy?: boolean;
  canCreateTrip?: boolean;
  onClose: () => void;
  onSelectTrip: (tripId: string) => void | Promise<void>;
  onCreateTrip: () => void | Promise<void>;
}

function reasonCopy(reason: ImportTargetTripReason): string {
  if (reason === "multiple-match") {
    return "These bookings could belong to more than one trip. Choose where they should go.";
  }
  if (reason === "active-mismatch") {
    return "The dates on this document don't match your current trip. Pick the right trip or start a new one.";
  }
  return "We couldn't match these dates to a trip automatically. Choose a trip or create a new one.";
}

export function ImportTripPickerModal({
  open,
  fileLabel,
  bookingCount,
  candidates,
  inferredTripName,
  inferredDateRange,
  reason,
  busy = false,
  canCreateTrip = true,
  onClose,
  onSelectTrip,
  onCreateTrip,
}: ImportTripPickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                Choose trip
              </p>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Where should this go?
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {reasonCopy(reason)}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {bookingCount} booking{bookingCount === 1 ? "" : "s"} from {fileLabel}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-2">
            {candidates.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSelectTrip(trip.id)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-sky-500/40 dark:hover:bg-sky-950/20"
                >
                  <p className="font-bold text-slate-900 dark:text-white">
                    {formatTripListTitle(trip)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatTripListSubtitle(trip)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatTripDateRange(trip.startDate, trip.endDate)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            type="button"
            disabled={busy || !canCreateTrip}
            onClick={() => void onCreateTrip()}
            className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : `Add new trip · ${inferredTripName} (${inferredDateRange})`}
          </button>
          {!canCreateTrip ? (
            <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
              Free plan supports one trip. Upgrade to add another.
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
