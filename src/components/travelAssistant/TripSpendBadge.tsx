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
  onClick?: () => void;
  /** Home tab — tap opens Book even when spend is fully tracked. */
  alwaysActionable?: boolean;
}

export function TripSpendBadge({
  summary,
  problemCount = 0,
  className = "",
  onClick,
  alwaysActionable = false,
}: TripSpendBadgeProps) {
  const hasCash = summary.cashTotalUsd > 0;
  const hasPoints = summary.pointsTotal > 0;
  const needsAttention = summary.missingPriceCount > 0;
  const hasProblems = problemCount > 0;
  const isActionable = Boolean(onClick && (alwaysActionable || needsAttention || hasProblems));
  const cashLabel = hasCash
    ? formatTripCashTotal(summary.cashTotalUsd)
    : hasPoints
      ? "$0 cash"
      : "$0";

  const shellClass = `rounded-xl border px-2.5 py-1.5 shadow-sm ${
    hasProblems
      ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10"
      : needsAttention
        ? "border-yellow-300 bg-yellow-50 dark:border-yellow-500/50 dark:bg-yellow-500/10"
        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
  } ${isActionable ? "cursor-pointer transition hover:shadow-md hover:ring-1 hover:ring-sky-200 dark:hover:ring-sky-500/40" : ""} ${className}`;

  const title =
    hasProblems
      ? `${problemCount} trip issue${problemCount === 1 ? "" : "s"} — tap to review in Book.`
      : needsAttention
        ? `${summary.missingPriceCount} reservation${summary.missingPriceCount === 1 ? "" : "s"} need miles or cash logged — tap to see which.`
        : "Trip spend — tap for the itemized cash and miles breakdown";

  const body = (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-sm">
        <span className="whitespace-nowrap">
          {cashLabel}
          <span className="font-medium text-slate-500 dark:text-slate-400"> spent</span>
        </span>
        {hasPoints ? (
          <span className="whitespace-nowrap text-sky-800 dark:text-sky-300">
            {formatTripPointsTotal(summary.pointsTotal)}
          </span>
        ) : null}
      </div>
      {hasProblems ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-red-900 dark:text-red-200">
          {problemCount} issue{problemCount === 1 ? "" : "s"} · tap to fix
        </span>
      ) : needsAttention ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-900 dark:text-yellow-200">
          {summary.missingPriceCount} need pricing · tap to see which
        </span>
      ) : hasPoints && !hasCash ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
          Award trip
        </span>
      ) : null}
    </div>
  );

  if (isActionable) {
    return (
      <button type="button" onClick={onClick} className={shellClass} title={title}>
        {body}
      </button>
    );
  }

  return (
    <div className={shellClass} title={title}>
      {body}
    </div>
  );
}
