"use client";

import {
  emergencyCoverageSummary,
  hasEmergencyCoverage,
} from "@/lib/vault/emergencyCoverageFields";
import { useEmergencyCoverage } from "@/components/travelAssistant/useEmergencyCoverage";

function phoneHref(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function EmergencyCoverageTravelDayStrip() {
  const { record, loading } = useEmergencyCoverage();

  if (loading || !hasEmergencyCoverage(record)) {
    return null;
  }

  return (
    <div className="mx-4 mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200/90">Emergency record</p>
      <p className="mt-1 text-base font-bold text-white">{emergencyCoverageSummary(record)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {record.assistancePhone ? (
          <a
            href={phoneHref(record.assistancePhone)}
            className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white"
          >
            Call assistance
          </a>
        ) : null}
        {record.emergencyContactPhone ? (
          <a
            href={phoneHref(record.emergencyContactPhone)}
            className="rounded-xl border border-rose-300/50 bg-white/10 px-4 py-3 text-sm font-bold text-rose-100"
          >
            Call {record.emergencyContactName || "contact"}
          </a>
        ) : null}
      </div>
    </div>
  );
}
