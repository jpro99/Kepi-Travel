"use client";

import type { TravelDayWalkthroughStep } from "@/lib/travelAssistant/homeTravelDayCoach";

/** Invent=0 BRI coach — title-only stack for above-fold on ~800px viewports. */
export function BriAirportCoachCompact({ steps }: { steps: TravelDayWalkthroughStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div
      className="mt-2 rounded-xl bg-white px-2.5 py-2 text-left"
      data-testid="bri-airport-coach-compact"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
        Bari airport coach
      </p>
      <ol className="mt-1 divide-y divide-[#E5E5EA]">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
            <span
              className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10 text-[10px] font-bold leading-none text-[#007AFF]"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <p className="min-w-0 text-[13px] font-medium leading-snug text-[#1D1D1F]">{step.title}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
