"use client";

import { useMemo, useState } from "react";
import { ShareModal } from "@/components/travelAssistant/ShareModal";

export interface TripSwitcherItem {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

interface TripSwitcherProps {
  trips: TripSwitcherItem[];
  activeTripId: string | null;
  onSwitchTrip: (tripId: string) => Promise<void> | void;
  onCreateTrip: () => Promise<void> | void;
  disabled?: boolean;
  creating?: boolean;
  canCreateTrip?: boolean;
  onRequestUpgrade?: () => void;
  createDisabledMessage?: string;
}

function formatTripDateRange(startDate: string, endDate: string): string {
  const start = startDate?.trim() || "unknown";
  const end = endDate?.trim() || "unknown";
  return `${start} - ${end}`;
}

export function TripSwitcher({
  trips,
  activeTripId,
  onSwitchTrip,
  onCreateTrip,
  disabled = false,
  creating = false,
  canCreateTrip = true,
  onRequestUpgrade,
  createDisabledMessage,
}: TripSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId) ?? trips[0] ?? null,
    [activeTripId, trips],
  );

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-w-56 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <span className="truncate">
          {activeTrip ? `${activeTrip.name} • ${activeTrip.destination}` : "Select trip"}
        </span>
        <span aria-hidden>▾</span>
      </button>
      <button
        type="button"
        disabled={disabled || !activeTrip}
        onClick={() => setShareOpen(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        Share Trip
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 w-80 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <ul className="max-h-80 overflow-y-auto p-2">
            {trips.length > 0 ? (
              trips.map((trip) => {
                const isActive = trip.id === activeTripId;
                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        await onSwitchTrip(trip.id);
                        setOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                        isActive
                          ? "border border-cyan-400/50 bg-cyan-500/15 text-cyan-900 dark:text-cyan-100"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <p className="truncate font-semibold">{trip.name}</p>
                      <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{trip.destination}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatTripDateRange(trip.startDate, trip.endDate)}
                      </p>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                No trips yet.
              </li>
            )}
          </ul>
          <div className="border-t border-slate-200 p-2 dark:border-slate-800">
            <button
              type="button"
              onClick={async () => {
                if (creating || disabled) return;
                if (!canCreateTrip) {
                  onRequestUpgrade?.();
                  setOpen(false);
                  return;
                }
                try {
                  await onCreateTrip();
                } finally {
                  setOpen(false);
                }
              }}
              disabled={disabled || creating}
              className="w-full rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating trip…" : canCreateTrip ? "New Trip" : "Upgrade for additional trips"}
            </button>
            {!canCreateTrip && createDisabledMessage ? (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{createDisabledMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ShareModal
        open={shareOpen}
        tripId={activeTrip?.id ?? null}
        tripName={activeTrip?.name ?? null}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
