"use client";

import type { TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import {
  formatTripCashTotal,
  formatTripPointsTotal,
} from "@/lib/travelAssistant/tripSpendSummary";

interface TripSpendBadgeProps {
  summary: TripSpendSummary;
  problemCount?: number;
  className?: string;
}

export function TripSpendBadge({ summary, problemCount = 0, className = "" }: TripSpendBadgeProps) {
  const hasSpend = summary.cashTotalUsd > 0 || summary.pointsTotal > 0;
  const needsAttention = summary.missingPriceCount > 0;
  const hasProblems = problemCount > 0;

  return (
    <div
      className={`rounded-xl border px-2.5 py-1.5 shadow-sm ${
        hasProblems
          ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10"
          : needsAttention
            ? "border-yellow-300 bg-yellow-50 dark:border-yellow-500/50 dark:bg-yellow-500/10"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      } ${className}`}
      title={
        hasProblems
          ? `${problemCount} trip issue${problemCount === 1 ? "" : "s"} — check flights or connections.`
          : needsAttention
            ? `${summary.missingPriceCount} reservation${summary.missingPriceCount === 1 ? "" : "s"} need a cost — tap a highlighted item to add it.`
            : "Trip spend tracked from reservation costs"
      }
    >
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-sm">
          <span className="whitespace-nowrap">
            {hasSpend ? formatTripCashTotal(summary.cashTotalUsd) : "$0"}
            <span className="font-medium text-slate-500 dark:text-slate-400"> spent</span>
          </span>
          {summary.pointsTotal > 0 ? (
            <span className="whitespace-nowrap text-violet-700 dark:text-violet-300">
              {formatTripPointsTotal(summary.pointsTotal)}
            </span>
          ) : null}
        </div>
        {hasProblems ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-red-900 dark:text-red-200">
            {problemCount} issue{problemCount === 1 ? "" : "s"}
          </span>
        ) : needsAttention ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-900 dark:text-yellow-200">
            {summary.missingPriceCount} need cost
          </span>
        ) : null}
      </div>
    </div>
  );
}
