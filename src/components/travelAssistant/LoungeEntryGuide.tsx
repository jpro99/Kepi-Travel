"use client";

import { entryMethodLabel, type BenefitEntryMethod } from "@/lib/points/benefitPlaybooks";
import type { LoungeEligibilityResult } from "@/lib/airportNav/types";

interface LoungeEntryGuideProps {
  lounges: LoungeEligibilityResult[];
  className?: string;
}

export function LoungeEntryGuide({ lounges, className = "" }: LoungeEntryGuideProps) {
  const eligible = lounges.filter((entry) => entry.eligible);
  if (eligible.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {eligible.map((lounge) => (
        <article
          key={lounge.loungeId}
          className="rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-500/30 dark:bg-slate-800"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {lounge.loungeName ?? lounge.loungeId}
              </p>
              {lounge.terminalHint ? (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{lounge.terminalHint}</p>
              ) : null}
              {lounge.via ? (
                <p className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                  Access via {lounge.via}
                </p>
              ) : null}
            </div>
            {lounge.entryMethod ? (
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                {entryMethodLabel(lounge.entryMethod as BenefitEntryMethod)}
              </span>
            ) : null}
          </div>

          {lounge.enrollmentRequired ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Setup needed: {lounge.reason ?? "Complete enrollment in Card wallet first."}
            </p>
          ) : null}

          {lounge.entrySteps && lounge.entrySteps.length > 0 ? (
            <ol className="mt-3 space-y-1.5 border-t border-indigo-100 pt-3 dark:border-indigo-500/20">
              {lounge.entrySteps.map((step, index) => (
                <li key={step} className="flex gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-bold text-indigo-500">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {lounge.guestPolicy ? (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Guests: {lounge.guestPolicy}</p>
          ) : null}

          {lounge.deepLink ? (
            <a
              href={lounge.deepLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
            >
              {lounge.deepLink.label} →
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
