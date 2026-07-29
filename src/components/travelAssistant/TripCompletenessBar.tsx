"use client";

import { useState } from "react";
import type {
  TripCompleteness,
  CompletenessTone,
  UncoveredNightRange,
} from "@/lib/travelAssistant/tripNightCoverage";
import { addIsoDays, formatStayRangeLabel } from "@/lib/travelAssistant/tripNightCoverage";

interface TripCompletenessBarProps {
  completeness: TripCompleteness;
  onOpenFlights?: () => void;
  /** Called when user picks a specific stay gap to find a hotel. */
  onFindStayForGap?: (gap: UncoveredNightRange) => void;
  onOpenPlan?: () => void;
}

function toneClass(tone: CompletenessTone): string {
  if (tone === "green") return "bg-[#34C759]";
  if (tone === "orange") return "bg-[#FF9F0A]";
  return "bg-[#D2D2D7]";
}

function toneText(tone: CompletenessTone): string {
  if (tone === "green") return "text-[#248A3D]";
  if (tone === "orange") return "text-[#C93400]";
  return "text-[#6E6E73]";
}

function nightWord(n: number): string {
  return n === 1 ? "night" : "nights";
}

export function TripCompletenessBar({
  completeness,
  onOpenFlights,
  onFindStayForGap,
  onOpenPlan,
}: TripCompletenessBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const gaps = completeness.hotelGaps ?? [];

  // I36 — green is quiet. No dual bars or Flights/Hotels grid when everything is set.
  if (completeness.overall === "green") {
    return (
      <section
        className="rounded-2xl bg-[#F5F5F7] px-4 py-3"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
        aria-label="Trip completeness"
      >
        <p className="text-[15px] font-medium text-[#6E6E73]">Flights and stays set</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-[#F5F5F7] px-4 py-3"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
      aria-label="Trip completeness"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">Trip status</p>
        <p className={`text-[12px] font-semibold ${toneText(completeness.overall)}`}>
          {completeness.overall === "orange" ? "Needs stays or flights" : "Not started"}
        </p>
      </div>

      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#E5E5EA]">
        <div className={`h-full w-1/2 ${toneClass(completeness.flights)}`} title="Flights" />
        <div className={`h-full w-1/2 ${toneClass(completeness.hotels)}`} title="Hotels" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenFlights}
          className="min-h-[44px] rounded-xl bg-white px-3 py-2 text-left"
        >
          <p className="text-[11px] font-semibold uppercase text-[#6E6E73]">Flights</p>
          <p className={`mt-0.5 text-[13px] font-semibold leading-snug ${toneText(completeness.flights)}`}>
            {completeness.flightsLabel}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (gaps.length > 0) setSheetOpen(true);
            else onOpenFlights?.();
          }}
          className="min-h-[44px] rounded-xl bg-white px-3 py-2 text-left"
        >
          <p className="text-[11px] font-semibold uppercase text-[#6E6E73]">Hotels</p>
          <p className={`mt-0.5 text-[13px] font-semibold leading-snug ${toneText(completeness.hotels)}`}>
            {completeness.hotelsLabel}
          </p>
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-[#6E6E73]">{completeness.summary}</p>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-6">
          <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#C93400]">
                  Stay gaps
                </p>
                <h3 className="mt-1 text-[22px] font-semibold text-[#1D1D1F]">
                  {gaps.reduce((sum, g) => sum + g.nightCount, 0)} {nightWord(gaps.reduce((sum, g) => sum + g.nightCount, 0))} still open
                </h3>
                <p className="mt-1 text-[15px] text-[#6E6E73]">
                  These are the nights with no hotel or Airbnb on your trip.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="min-h-[44px] rounded-full px-3 text-[15px] font-semibold text-[#007AFF]"
              >
                Close
              </button>
            </header>

            <ul className="mt-4 space-y-2">
              {gaps.map((gap) => (
                <li
                  key={`${gap.startNight}-${gap.endNight}`}
                  className="rounded-2xl bg-[#F5F5F7] px-4 py-3"
                >
                  <p className="text-[17px] font-semibold text-[#1D1D1F]">
                    {formatStayRangeLabel(gap.startNight, gap.endNight)}
                  </p>
                  <p className="mt-0.5 text-[14px] text-[#6E6E73]">
                    {gap.nightCount} {nightWord(gap.nightCount)}
                    {gap.suggestedCity ? ` · near ${gap.suggestedCity}` : ""}
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73]">
                    Check-in {formatStayRangeLabel(gap.startNight, gap.startNight)} · check-out{" "}
                    {formatStayRangeLabel(addIsoDays(gap.endNight, 1), addIsoDays(gap.endNight, 1))}
                  </p>
                  <button
                    type="button"
                    className="mt-3 min-h-[48px] w-full rounded-2xl bg-[#007AFF] text-[16px] font-semibold text-white"
                    onClick={() => {
                      setSheetOpen(false);
                      onFindStayForGap?.(gap);
                    }}
                  >
                    Find a stay for these nights
                  </button>
                </li>
              ))}
            </ul>

            {onOpenPlan ? (
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  onOpenPlan();
                }}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center text-[15px] font-semibold text-[#007AFF]"
              >
                Open Plan to see empty days
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
