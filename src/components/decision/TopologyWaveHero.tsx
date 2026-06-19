"use client";

import type { TopologySearchResult } from "@/lib/decision/topology/types";

interface TopologyWaveHeroProps {
  search: TopologySearchResult;
}

export function TopologyWaveHero({ search }: TopologyWaveHeroProps) {
  const baseline = search.baseline;
  const best = search.winners[0];

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-[#f4c95d]/40 bg-gradient-to-br from-[#0b1f3a] via-[#152238] to-[#0b1f3a] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">
            Kepi Wave Search
          </p>
          <h2 className="mt-1 text-lg font-black leading-snug text-white">{search.headline}</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{search.routeSummary}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">Searched</p>
          <p className="text-sm font-black tabular-nums text-white">
            {search.candidatesGenerated} shapes
          </p>
          <p className="text-[10px] text-emerald-100/70">
            {search.duffelCallsUsed} live · {search.candidatesPruned} pruned
          </p>
        </div>
      </div>

      {baseline && best ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-600 bg-[#152238]/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Google-style baseline</p>
            <p className="mt-1 text-sm font-bold text-white">{baseline.candidate.title}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-200">
              ${baseline.totalTripValue.toLocaleString()}
              <span className="ml-1 text-xs font-semibold text-slate-500">trip value</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-400">{baseline.candidate.savingsDna}</p>
          </article>
          <article className="rounded-2xl border border-[#f4c95d]/50 bg-[#1a2d4a]/90 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#f4c95d]">Kepi best routing</p>
            <p className="mt-1 text-sm font-bold text-white">{best.candidate.title}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">
              ${best.totalTripValue.toLocaleString()}
              {best.savingsVsBaselineUsd > 0 ? (
                <span className="ml-2 text-sm font-black text-emerald-300">
                  −${best.savingsVsBaselineUsd.toLocaleString()}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[11px] text-slate-300">{best.candidate.savingsDna}</p>
          </article>
        </div>
      ) : null}

      {search.winners.length > 1 ? (
        <ul className="mt-4 space-y-2">
          {search.winners.slice(1, 4).map((row) => (
            <li
              key={row.candidate.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/80 bg-[#152238]/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{row.candidate.title}</p>
                <p className="truncate text-[10px] text-slate-400">{row.candidate.headline}</p>
              </div>
              <p className="shrink-0 text-sm font-black tabular-nums text-slate-200">
                ${row.totalTripValue.toLocaleString()}
                {row.savingsVsBaselineUsd > 0 ? (
                  <span className="ml-1 text-[10px] font-bold text-emerald-300">
                    −${row.savingsVsBaselineUsd}
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-500">
        Wave Search generates open-jaw, gateway, positioning, and ground-connector shapes Google never compares as one
        trip — then live-prices each winner via Duffel.
      </p>
    </section>
  );
}
