"use client";

import { useMemo } from "react";
import type { PostBookingBriefingContent } from "@/lib/airportNav/postBookingBriefing";

interface PostBookingBriefingCardProps {
  briefing: PostBookingBriefingContent;
}

export function PostBookingBriefingCard({ briefing }: PostBookingBriefingCardProps) {
  const toneClass = useMemo(
    () =>
      briefing.stage === "actionable"
        ? "border-[#0b1f3a]/20 bg-[#0b1f3a]/5 dark:border-sky-400/30 dark:bg-sky-950/30"
        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60",
    [briefing.stage],
  );

  return (
    <section className={`rounded-2xl border px-4 py-3 ${toneClass}`} aria-label="Airport briefing">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {briefing.stage === "actionable" ? "Departure plan" : "Your airport benefits"}
      </p>
      <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{briefing.headline}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
        {briefing.bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
