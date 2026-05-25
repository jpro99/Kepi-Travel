"use client";

import { useMemo, useState } from "react";
import { detectTripGaps, type TripGap } from "@/lib/travelAssistant/gapDetectionService";

interface GapAlertsProps {
  reservations: {
    id: string;
    type: string;
    provider: string;
    localTime: string;
    location: string;
    flightDate?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    checkOutDate?: string;
    confirmationCode?: string;
  }[];
  onActionTap?: (tab: string) => void;
}

const SEVERITY_STYLES: Record<TripGap["severity"], { border: string; bg: string; title: string; dot: string }> = {
  critical: {
    border: "border-red-300 dark:border-red-500/50",
    bg: "bg-red-50 dark:bg-red-500/10",
    title: "text-red-900 dark:text-red-100",
    dot: "bg-red-500",
  },
  warning: {
    border: "border-amber-300 dark:border-amber-500/50",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    title: "text-amber-900 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  info: {
    border: "border-blue-200 dark:border-blue-500/40",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    title: "text-blue-900 dark:text-blue-100",
    dot: "bg-blue-400",
  },
};

export function GapAlerts({ reservations, onActionTap }: GapAlertsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const gaps = useMemo(
    () => detectTripGaps(reservations).filter((g) => !dismissed.has(g.id)),
    [reservations, dismissed],
  );

  if (gaps.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Planning gaps
        </span>
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {gaps.length}
        </span>
      </div>
      {gaps.map((gap) => {
        const s = SEVERITY_STYLES[gap.severity];
        return (
          <div
            key={gap.id}
            className={`rounded-2xl border px-4 py-3 ${s.border} ${s.bg}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${s.title}`}>
                    {gap.emoji} {gap.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {gap.detail}
                  </p>
                  {gap.actionLabel && gap.actionTab ? (
                    <button
                      type="button"
                      onClick={() => onActionTap?.(gap.actionTab!)}
                      className="mt-2 rounded-lg bg-slate-900/10 px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-900/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                    >
                      {gap.actionLabel} →
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set([...prev, gap.id]))}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
