"use client";

import { BOOK_SUBTAB_TOGGLE_CLASS, bookSubTabButtonClass } from "@/components/travelAssistant/bookTabStyles";
import {
  formatTripCashTotal,
  formatTripPointsTotal,
  type TripSpendSummary,
} from "@/lib/travelAssistant/tripSpendSummary";

interface MobileBookHeaderProps {
  tripName: string;
  flightCount: number;
  hotelCount: number;
  tripSpendSummary?: TripSpendSummary;
  problemCount?: number;
  onReviewPricing?: () => void;
}

export function MobileBookHeader({
  tripName,
  flightCount,
  hotelCount,
  tripSpendSummary,
  problemCount = 0,
  onReviewPricing,
}: MobileBookHeaderProps) {
  const hasCash = (tripSpendSummary?.cashTotalUsd ?? 0) > 0;
  const hasPoints = (tripSpendSummary?.pointsTotal ?? 0) > 0;
  const needsAttention = (tripSpendSummary?.missingPriceCount ?? 0) > 0;
  const isActionable = Boolean(onReviewPricing && (needsAttention || problemCount > 0));

  const spendLine = tripSpendSummary ? (
    <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
      {hasCash ? formatTripCashTotal(tripSpendSummary.cashTotalUsd) : hasPoints ? "$0 cash" : "$0"}
      {hasCash ? " spent" : ""}
      {hasPoints ? ` · ${formatTripPointsTotal(tripSpendSummary.pointsTotal)}` : ""}
      {hasPoints && !hasCash ? " · Award trip" : ""}
    </p>
  ) : null;

  const attentionLine =
    needsAttention || problemCount > 0 ? (
      <button
        type="button"
        onClick={isActionable ? onReviewPricing : undefined}
        className={`mt-1 text-left text-[13px] font-semibold text-[var(--warning)] ${isActionable ? "underline underline-offset-2" : ""}`}
      >
        {problemCount > 0
          ? `${problemCount} issue${problemCount === 1 ? "" : "s"} · tap to fix`
          : `${tripSpendSummary?.missingPriceCount ?? 0} need pricing · tap to fix`}
      </button>
    ) : null;

  return (
    <header className="rounded-[18px] bg-[var(--bg-card)] px-5 py-4 shadow-sm ring-1 ring-[var(--border-default)]">
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">Book</p>
      <h1 className="mt-0.5 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
        {tripName}
      </h1>
      <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
        {flightCount} flight{flightCount === 1 ? "" : "s"} · {hotelCount} stay{hotelCount === 1 ? "" : "s"}
      </p>
      {spendLine}
      {attentionLine}
    </header>
  );
}

interface MobileBookSegmentToggleProps {
  active: "flights" | "hotels";
  onChange: (segment: "flights" | "hotels") => void;
}

export function MobileBookSegmentToggle({ active, onChange }: MobileBookSegmentToggleProps) {
  return (
    <div className={BOOK_SUBTAB_TOGGLE_CLASS}>
      <button
        type="button"
        onClick={() => onChange("flights")}
        className={bookSubTabButtonClass(active === "flights")}
      >
        Flights
      </button>
      <button
        type="button"
        onClick={() => onChange("hotels")}
        className={bookSubTabButtonClass(active === "hotels")}
      >
        Hotels
      </button>
    </div>
  );
}
