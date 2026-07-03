"use client";

import type { EarnStackSuggestion } from "@/lib/travelFit/types";

export function EarnStackHint({ stack }: { stack: EarnStackSuggestion | null }) {
  if (!stack) return null;

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
      <p className="text-[10px] font-black uppercase tracking-widest text-sky-800 dark:text-sky-200">{stack.headline}</p>
      <ul className="mt-2 space-y-1.5">
        {stack.steps.map((step) => (
          <li key={step} className="text-xs text-sky-900 dark:text-sky-100">
            • {step}
          </li>
        ))}
      </ul>
      {stack.cardHint ? (
        <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
          💳 {stack.cardHint.cardName}: {stack.cardHint.reason}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] text-slate-500">{stack.disclaimer}</p>
    </div>
  );
}
