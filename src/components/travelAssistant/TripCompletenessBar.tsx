"use client";

import type { TripCompleteness, CompletenessTone } from "@/lib/travelAssistant/tripNightCoverage";

interface TripCompletenessBarProps {
  completeness: TripCompleteness;
  onOpenFlights?: () => void;
  onOpenHotels?: () => void;
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

export function TripCompletenessBar({
  completeness,
  onOpenFlights,
  onOpenHotels,
}: TripCompletenessBarProps) {
  return (
    <section
      className="rounded-2xl bg-[#F5F5F7] px-4 py-3"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
      aria-label="Trip completeness"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">Trip status</p>
        <p className={`text-[12px] font-semibold ${toneText(completeness.overall)}`}>
          {completeness.overall === "green"
            ? "Complete"
            : completeness.overall === "orange"
              ? "Needs stays or flights"
              : "Not started"}
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
          onClick={onOpenHotels}
          className="min-h-[44px] rounded-xl bg-white px-3 py-2 text-left"
        >
          <p className="text-[11px] font-semibold uppercase text-[#6E6E73]">Hotels</p>
          <p className={`mt-0.5 text-[13px] font-semibold leading-snug ${toneText(completeness.hotels)}`}>
            {completeness.hotelsLabel}
          </p>
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-[#6E6E73]">{completeness.summary}</p>
    </section>
  );
}
