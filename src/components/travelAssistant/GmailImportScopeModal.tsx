"use client";

import { useMemo, useState } from "react";

export type GmailImportLookbackDays = 30 | 60 | 90 | 180;

export interface GmailImportScope {
  lookbackDays: GmailImportLookbackDays;
  tripStartDate?: string;
  tripEndDate?: string;
  destination?: string;
}

interface GmailImportScopeModalProps {
  open: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (scope: GmailImportScope) => void;
}

const LOOKBACK_OPTIONS: GmailImportLookbackDays[] = [30, 60, 90, 180];

export function GmailImportScopeModal({ open, isSubmitting = false, onCancel, onConfirm }: GmailImportScopeModalProps) {
  const [lookbackDays, setLookbackDays] = useState<GmailImportLookbackDays>(90);
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [destination, setDestination] = useState("");

  const dateRangeError = useMemo(() => {
    if (!tripStartDate || !tripEndDate) return null;
    const start = Date.parse(tripStartDate);
    const end = Date.parse(tripEndDate);
    if (Number.isNaN(start) || Number.isNaN(end)) return "Please enter valid trip dates.";
    if (start > end) return "Trip start date must be on or before trip end date.";
    return null;
  }, [tripEndDate, tripStartDate]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Trip Date Scope</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Choose the inbox search window and optional trip dates before importing reservations.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Lookback window
            </p>
            <div className="grid grid-cols-4 gap-2">
              {LOOKBACK_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLookbackDays(option)}
                  className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                    lookbackDays === option
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-800 dark:text-cyan-100"
                      : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                  aria-pressed={lookbackDays === option}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Trip start date
              </span>
              <input
                type="date"
                value={tripStartDate}
                onChange={(event) => setTripStartDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Trip end date
              </span>
              <input
                type="date"
                value={tripEndDate}
                onChange={(event) => setTripEndDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Destination (optional)
            </span>
            <input
              type="text"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="e.g. Tokyo, Seattle, Rome"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        {dateRangeError ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{dateRangeError}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                lookbackDays,
                tripStartDate: tripStartDate || undefined,
                tripEndDate: tripEndDate || undefined,
                destination: destination.trim() || undefined,
              })
            }
            disabled={isSubmitting || Boolean(dateRangeError)}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Searching..." : "Search inbox"}
          </button>
        </div>
      </div>
    </div>
  );
}
