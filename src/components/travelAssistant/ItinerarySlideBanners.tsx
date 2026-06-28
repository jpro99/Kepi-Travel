"use client";

import { useEffect, useMemo, useState } from "react";
import { detectTripGaps, type TripGap } from "@/lib/travelAssistant/gapDetectionService";

interface ItinerarySlideBannersProps {
  reservations: Parameters<typeof detectTripGaps>[0];
  onActionTap?: (tab: string) => void;
  autoDismissMs?: number;
}

const SEVERITY_BORDER: Record<TripGap["severity"], string> = {
  critical: "border-red-400/60",
  warning: "border-amber-400/60",
  info: "border-slate-400/40",
};

export function ItinerarySlideBanners({
  reservations,
  onActionTap,
  autoDismissMs = 8000,
}: ItinerarySlideBannersProps) {
  const gaps = useMemo(() => detectTripGaps(reservations), [reservations]);
  const [visible, setVisible] = useState<TripGap[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = gaps.filter((gap) => !dismissed.has(gap.id));
    setVisible(next.slice(0, 3));
  }, [gaps, dismissed]);

  useEffect(() => {
    if (visible.length === 0) return;
    const timer = window.setTimeout(() => {
      setDismissed((prev) => {
        const next = new Set(prev);
        for (const gap of visible) next.add(gap.id);
        return next;
      });
    }, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [visible, autoDismissMs]);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex flex-col items-center gap-2 px-4 sm:top-24">
      {visible.map((gap, index) => (
        <div
          key={gap.id}
          role="alert"
          className={`pointer-events-auto w-full max-w-lg rounded-2xl border bg-[#0F1923]/95 px-4 py-3 shadow-2xl backdrop-blur-md ${SEVERITY_BORDER[gap.severity]}`}
          style={{ transform: `translateY(${index * 4}px)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white">
                {gap.emoji} {gap.title}
              </p>
              <p className="mt-0.5 text-xs font-normal text-slate-300">{gap.detail}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed((prev) => new Set(prev).add(gap.id))}
              className="shrink-0 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          {gap.actionTab && gap.actionLabel ? (
            <button
              type="button"
              onClick={() => onActionTap?.(gap.actionTab!)}
              className="mt-2 text-xs font-semibold text-[#f4c95d] underline-offset-2 hover:underline"
            >
              {gap.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
