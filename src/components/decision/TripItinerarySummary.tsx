"use client";

import type { TripIntent } from "@/lib/decision/types";

export function TripItinerarySummary({ intent }: { intent: TripIntent }) {
  if (!intent.stops?.length && !intent.originCity && !intent.returnCity && !intent.loyaltyPrograms?.length) {
    return null;
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your trip sketch</p>

      {intent.originCity && (
        <p className="mt-2 text-sm text-slate-200">
          <span className="font-bold text-white">From:</span> {intent.originCity}
          {intent.originAirports?.length ? (
            <span className="text-slate-400"> · via {intent.originAirports.slice(0, 3).join(", ")}</span>
          ) : null}
        </p>
      )}

      {intent.returnCity && (
        <p className="mt-2 text-sm text-slate-200">
          <span className="font-bold text-white">Fly home from:</span> {intent.returnCity}
          {intent.returnAirports?.length ? (
            <span className="text-slate-400"> · via {intent.returnAirports.slice(0, 3).join(", ")}</span>
          ) : null}
        </p>
      )}

      {intent.stops && intent.stops.length > 0 && (
        <ol className="mt-3 space-y-2">
          {intent.stops.map((stop, index) => (
            <li key={`${stop.name}-${index}`} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/25 text-[10px] font-black text-amber-200">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{stop.name}</p>
                <p className="text-xs text-slate-400">
                  {[stop.nightsLabel, stop.nights ? `${stop.nights} nights` : null, stop.iata]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-lg bg-slate-700 px-2 py-1 font-semibold text-slate-100">
          {intent.startDate} → {intent.endDate}
        </span>
        <span className="rounded-lg bg-slate-700 px-2 py-1 font-semibold text-slate-100">
          {intent.nights} nights
        </span>
        {intent.loyaltyPrograms?.map((program) => (
          <span
            key={program}
            className="rounded-lg bg-sky-900/80 px-2 py-1 font-bold text-sky-100"
          >
            {program}
          </span>
        ))}
        {intent.preferredAirlines?.map((airline) => (
          <span
            key={airline}
            className="rounded-lg bg-emerald-900/80 px-2 py-1 font-bold text-emerald-100"
          >
            Prefer {airline}
          </span>
        ))}
        {intent.budgetHint && (
          <span className="rounded-lg bg-slate-700 px-2 py-1 font-semibold text-slate-200">
            Budget {intent.budgetHint}
          </span>
        )}
      </div>
    </section>
  );
}
