"use client";

import type { FusedOffer, FusedSearchResult, LoyaltyProgram } from "@/lib/flights/types";

interface FusedFlightHeroProps {
  search: FusedSearchResult;
}

const PROGRAM_LABELS: Partial<Record<LoyaltyProgram, string>> = {
  chase_ur: "Chase UR",
  amex_mr: "Amex MR",
  capitalone: "Capital One",
  citi_typ: "Citi TYP",
  united: "United",
  american: "American",
  delta: "Delta",
  alaska: "Alaska",
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  avios_ba: "BA Avios",
  lifemiles: "LifeMiles",
  singapore_krisflyer: "Singapore",
};

function programLabel(program: LoyaltyProgram): string {
  return PROGRAM_LABELS[program] ?? program;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function offerHeadline(row: FusedOffer): string {
  if (row.offer.kind === "cash") {
    const carrier = row.offer.segments[0]?.marketingCarrier ?? "Duffel";
    return `${formatUsd(row.cashEquivalent)} cash · ${carrier}`;
  }
  return `${row.offer.milesCost.toLocaleString()} ${programLabel(row.offer.program)} mi`;
}

export function FusedFlightHero({ search }: FusedFlightHeroProps) {
  const best = search.offers[0];
  const cheapestCash = search.cheapestCash;
  const bestAward = search.bestAward;
  const route = `${search.params.origin} → ${search.params.destination}`;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0b1f3a] via-[#122a45] to-[#0b1f3a] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
            Cash vs points
          </p>
          <h2 className="mt-1 text-lg font-black leading-snug text-white">
            {search.headline ?? "Fused cash + award search complete"}
          </h2>
          <p className="mt-2 text-xs text-slate-300">
            {route} · {search.params.departDate}
            {search.params.passengers > 1 ? ` · ${search.params.passengers} travelers` : null}
            {` · ${search.params.cabin.replace("_", " ")}`}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Sources</p>
          <p className="text-sm font-black tabular-nums text-white">
            {search.meta.cashCount} cash · {search.meta.awardCount} award
          </p>
          <p className="text-[10px] text-sky-100/70">
            {search.meta.elapsedMs}ms
            {search.meta.cashCached || search.meta.awardCached
              ? ` · cache ${search.meta.cashCached ? "cash" : ""}${search.meta.cashCached && search.meta.awardCached ? "+" : ""}${search.meta.awardCached ? "award" : ""}`
              : " · live"}
          </p>
        </div>
      </div>

      {best ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-600 bg-[#152238]/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Live cash</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-100">
              {cheapestCash ? formatUsd(cheapestCash.cashEquivalent) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {cheapestCash?.metrics?.stops ?? 0} stop
              {(cheapestCash?.metrics?.stops ?? 0) === 1 ? "" : "s"}
              {cheapestCash?.score !== undefined ? ` · score ${cheapestCash.score}` : null}
            </p>
          </article>
          <article
            className={`rounded-2xl border p-4 ${
              bestAward
                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                : "border-sky-500/40 bg-sky-950/30 text-sky-200"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Kepi verdict</p>
            <p className="mt-1 text-sm font-black">
              {best.offer.kind === "award" ? "Use points" : "Pay cash"}
            </p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">{offerHeadline(best)}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {best.centsPerPoint ? `${best.centsPerPoint}c/pt · ` : null}
              {best.recommendationReason ?? (best.score !== undefined ? `Composite score ${best.score}` : null)}
            </p>
          </article>
        </div>
      ) : null}

      {search.warnings.length > 0 ? (
        <p className="mt-3 text-[10px] text-amber-200/90">{search.warnings.join(" ")}</p>
      ) : null}

      {search.offers.length > 1 ? (
        <ul className="mt-4 space-y-2">
          {search.offers.slice(1, 4).map((row) => (
            <li
              key={row.offer.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/80 bg-[#152238]/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{offerHeadline(row)}</p>
                <p className="truncate text-[10px] text-slate-400">
                  {row.offer.kind === "award" ? (row.reachable ? "Reachable" : "Transfer needed") : "Cash"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-black tabular-nums text-slate-200">
                {formatUsd(row.cashEquivalent)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
