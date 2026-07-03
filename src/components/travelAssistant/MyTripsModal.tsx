"use client";

import { useEffect, useMemo } from "react";
import {
  formatTripListSubtitle,
  formatTripListTitle,
  isEmptyTripShell,
  sortTripsForDisplay,
  type TripListRowInput,
} from "@/lib/travelAssistant/tripListDisplay";

export interface MyTripsModalProps {
  open: boolean;
  trips: TripListRowInput[];
  activeTripId: string | null;
  deletingTripId: string | null;
  busy?: boolean;
  onClose: () => void;
  onSwitchTrip: (tripId: string) => void | Promise<void>;
  onDeleteTrip: (tripId: string) => void | Promise<void>;
  onCreateTrip: () => void;
  onDeleteEmptyTrips: () => void | Promise<void>;
}

export function MyTripsModal({
  open,
  trips,
  activeTripId,
  deletingTripId,
  busy = false,
  onClose,
  onSwitchTrip,
  onDeleteTrip,
  onCreateTrip,
  onDeleteEmptyTrips,
}: MyTripsModalProps) {
  const sortedTrips = useMemo(() => sortTripsForDisplay(trips), [trips]);
  const emptyShellCount = useMemo(() => sortedTrips.filter(isEmptyTripShell).length, [sortedTrips]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">My trips</p>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {sortedTrips.length} trip{sortedTrips.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sorted by departure date. Tap a trip to switch, or delete ones you do not need.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {sortedTrips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
              <p className="font-semibold text-slate-900 dark:text-white">No trips yet</p>
              <p className="mt-1 text-sm text-slate-500">Plan your first trip to get started.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedTrips.map((trip) => {
                const isActive = trip.id === activeTripId;
                const isDeleting = deletingTripId === trip.id;
                const isShell = isEmptyTripShell(trip);
                return (
                  <li
                    key={trip.id}
                    className={`rounded-2xl border p-3 ${
                      isActive
                        ? "border-sky-400 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/30"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void onSwitchTrip(trip.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate font-bold text-slate-900 dark:text-white">{formatTripListTitle(trip)}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatTripListSubtitle(trip)}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isActive ? (
                            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Active
                            </span>
                          ) : null}
                          {isShell ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                              Empty shell
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={busy || isDeleting}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteTrip(trip.id);
                        }}
                        className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-60 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                      >
                        {isDeleting ? "…" : "Delete"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="space-y-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          {emptyShellCount > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDeleteEmptyTrips()}
              className="w-full rounded-xl border border-amber-300 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-60 dark:border-amber-500/40 dark:text-amber-100"
            >
              Remove {emptyShellCount} empty trips
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onCreateTrip();
              onClose();
            }}
            className="w-full rounded-2xl bg-[#f4c95d] py-3.5 text-sm font-black text-[#0b1f3a]"
          >
            + Plan a new trip
          </button>
        </footer>
      </div>
    </div>
  );
}
