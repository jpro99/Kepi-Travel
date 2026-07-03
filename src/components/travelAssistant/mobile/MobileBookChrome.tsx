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
    <p className="mt-2 text-[15px] text-sky-200/90">
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
        className={`mt-1 text-left text-[13px] font-bold uppercase tracking-wide text-[#f4c95d] ${isActionable ? "underline underline-offset-2" : ""}`}
      >
        {problemCount > 0
          ? `${problemCount} issue${problemCount === 1 ? "" : "s"} · tap to fix`
          : `${tripSpendSummary?.missingPriceCount ?? 0} need pricing · tap to fix`}
      </button>
    ) : null;

  return (
    <header className="rounded-2xl bg-[#0F1923] px-5 py-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Book</p>
      <h1 className="mt-1 text-[1.75rem] font-black leading-tight tracking-tight text-white">{tripName}</h1>
      <p className="mt-1 text-[17px] text-slate-300">
        {flightCount} flight{flightCount === 1 ? "" : "s"} · {hotelCount} hotel{hotelCount === 1 ? "" : "s"}
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
