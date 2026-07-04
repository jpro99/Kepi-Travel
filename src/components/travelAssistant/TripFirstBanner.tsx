"use client";

import {
  buildTripFirstBody,
  buildTripFirstHeadline,
  type TripFirstVariant,
} from "@/lib/travelAssistant/tripFirstMessaging";

export function TripFirstBanner({
  variant = "general",
  className = "",
}: {
  variant?: TripFirstVariant;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#f4c95d]/40 bg-gradient-to-br from-[#0b1f3a] to-[#152238] px-4 py-4 text-white dark:border-[#f4c95d]/30 ${className}`}
    >
      <p className="text-sm font-black text-[#f4c95d]">{buildTripFirstHeadline()}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{buildTripFirstBody(variant)}</p>
    </div>
  );
}
