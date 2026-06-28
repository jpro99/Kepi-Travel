"use client";

import {
  buildFlightSearchPlan,
  type FlightSearchPlan,
  type PlannedFlightLeg,
} from "@/lib/travelAssistant/tripPlanBooking";
import {
  interCityTransportDetail,
  interCityTransportQuestion,
  listMissingTransportGaps,
  type InterCityTransportGap,
} from "@/lib/travelAssistant/interCityTransport";

interface InterCityTransportPromptsProps {
  legs: PlannedFlightLeg[];
  onSearchFlights: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onAddTransport: () => void;
}

function roleBadge(role: InterCityTransportGap["role"]): string {
  if (role === "outbound") return "Start of trip";
  if (role === "return") return "Head home";
  return "Between cities";
}

export function InterCityTransportPrompts({
  legs,
  onSearchFlights,
  onAddTransport,
}: InterCityTransportPromptsProps) {
  const gaps = listMissingTransportGaps(legs);
  if (gaps.length === 0) return null;

  const searchOne = (gap: InterCityTransportGap): void => {
    const plan = buildFlightSearchPlan([gap.leg]);
    if (!plan) return;
    onSearchFlights(plan, [gap.leg]);
  };

  const searchAll = (): void => {
    const selected = gaps.map((gap) => gap.leg);
    const plan = buildFlightSearchPlan(selected);
    if (!plan) return;
    onSearchFlights(plan, selected);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-950/40 dark:via-slate-900 dark:to-sky-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            Missing transport
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Search for a new flight</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Your itinerary has {gaps.length} leg{gaps.length === 1 ? "" : "s"} without booked transport.
          </p>
        </div>
        <button
          type="button"
          onClick={searchAll}
          className="shrink-0 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-bold text-white shadow-sm active:opacity-80"
        >
          Search all missing
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {gaps.map((gap) => (
          <li
            key={gap.id}
            className="rounded-2xl border border-amber-200/80 bg-white/90 p-4 dark:border-amber-500/20 dark:bg-slate-900/80"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                {roleBadge(gap.role)}
              </span>
              {gap.dateDisplay ? (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{gap.dateDisplay}</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm font-bold leading-snug text-slate-900 dark:text-white">
              {interCityTransportQuestion(gap)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {interCityTransportDetail(gap)}
            </p>
            <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
              {gap.fromLabel} → {gap.toLabel}
              {gap.fromIata && gap.toIata ? ` · ${gap.fromIata} → ${gap.toIata}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => searchOne(gap)}
                className="rounded-full bg-[#007AFF] px-4 py-2 text-xs font-bold text-white active:opacity-80"
              >
                Search flights
              </button>
              <button
                type="button"
                onClick={onAddTransport}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 active:opacity-80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Add train or transfer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
