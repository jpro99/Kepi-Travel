"use client";

import {
  emergencyCoverageSummary,
  hasEmergencyCoverage,
} from "@/lib/vault/emergencyCoverageFields";
import { useEmergencyCoverage } from "@/components/travelAssistant/useEmergencyCoverage";

interface EmergencyCoverageQuickCardProps {
  onOpenFullRecord?: () => void;
}

function phoneHref(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function EmergencyCoverageQuickCard({ onOpenFullRecord }: EmergencyCoverageQuickCardProps) {
  const { record, loading } = useEmergencyCoverage();

  if (loading) return null;

  const saved = hasEmergencyCoverage(record);

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm dark:border-rose-500/35 dark:bg-rose-950/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-300">
            Emergency
          </p>
          <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
            {saved ? emergencyCoverageSummary(record) : "Add trip protection for emergencies"}
          </p>
          {!saved ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Save your purchased policy and assistance number — one tap when you need it.
            </p>
          ) : null}
        </div>
        <span className="text-2xl shrink-0" aria-hidden>
          🆘
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {record.assistancePhone ? (
          <a
            href={phoneHref(record.assistancePhone)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white sm:flex-none"
          >
            Call assistance
          </a>
        ) : null}
        {record.emergencyContactPhone ? (
          <a
            href={phoneHref(record.emergencyContactPhone)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-sm font-bold text-rose-800 dark:border-rose-500/40 dark:bg-slate-900 dark:text-rose-100 sm:flex-none"
          >
            Call contact
          </a>
        ) : null}
        {onOpenFullRecord ? (
          <button
            type="button"
            onClick={onOpenFullRecord}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200 sm:flex-none"
          >
            {saved ? "View record" : "Add record →"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
