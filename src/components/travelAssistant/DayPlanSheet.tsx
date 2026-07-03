"use client";

import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";

export type DayPlanMode = "flight" | "train" | "bus" | "car" | "hotel";

interface DayPlanSheetProps {
  open: boolean;
  dateKey: string;
  intent: ParsedDayIntent | null;
  onClose: () => void;
  onSelectMode: (mode: DayPlanMode) => void;
}

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function DayPlanSheet({ open, dateKey, intent, onClose, onSelectMode }: DayPlanSheetProps) {
  if (!open || !intent) return null;

  const modes: Array<{ id: DayPlanMode; label: string; detail: string; show: boolean }> = [
    {
      id: "flight",
      label: "Flight",
      detail: intent.fromCity && intent.toCity ? `${intent.fromCity} → ${intent.toCity}` : "Search flights for this leg",
      show: intent.needsTransport,
    },
    {
      id: "train",
      label: "Train",
      detail: "Regional rail — often best in Europe",
      show: intent.needsTransport,
    },
    {
      id: "bus",
      label: "Bus",
      detail: "Coach or shuttle between cities",
      show: intent.needsTransport,
    },
    {
      id: "car",
      label: "Car / rental",
      detail: "Drive or rent for flexibility",
      show: intent.needsTransport,
    },
    {
      id: "hotel",
      label: "Hotel / stay",
      detail: intent.toCity || intent.stayCity ? `Find stay in ${intent.toCity ?? intent.stayCity}` : "Search hotels for this night",
      show: intent.needsHotelCheckin,
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Plan this day</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">{formatDayLabel(dateKey)}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{intent.summary}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {modes
            .filter((mode) => mode.show)
            .map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onSelectMode(mode.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/30"
              >
                <span className="text-sm font-bold text-slate-900 dark:text-white">{mode.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{mode.detail}</span>
              </button>
            ))}
        </div>

        {intent.needsHotelCheckout ? (
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
            Checkout day — plan transport out and confirm your next stay.
          </p>
        ) : null}
      </div>
    </div>
  );
}
