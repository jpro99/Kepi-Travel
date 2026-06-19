"use client";

import type { FusedFlightSearchResult, PaymentVerdict } from "@/lib/flights/types";

interface FusedFlightHeroProps {
  search: FusedFlightSearchResult;
}

function verdictLabel(verdict: PaymentVerdict): string {
  switch (verdict) {
    case "use_points":
      return "Use points";
    case "transfer_points":
      return "Transfer & book";
    case "insufficient_points":
      return "Need more points";
    default:
      return "Pay cash";
  }
}

function verdictTone(verdict: PaymentVerdict): string {
  switch (verdict) {
    case "use_points":
    case "transfer_points":
      return "border-emerald-500/40 bg-emerald-950/30 text-emerald-200";
    case "insufficient_points":
      return "border-amber-500/40 bg-amber-950/30 text-amber-200";
    default:
      return "border-sky-500/40 bg-sky-950/30 text-sky-200";
  }
}

export function FusedFlightHero({ search }: FusedFlightHeroProps) {
  const best = search.best;
  const route = `${search.params.origins.join("/")} → ${search.params.destination}`;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0b1f3a] via-[#122a45] to-[#0b1f3a] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
            Cash vs points
          </p>
          <h2 className="mt-1 text-lg font-black leading-snug text-white">{search.headline}</h2>
          <p className="mt-2 text-xs text-slate-300">
            {route} · {search.params.departureDate}
            {search.params.cabin ? ` · ${search.params.cabin.replace("_", " ")}` : null}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Sources</p>
          <p className="text-sm font-black tabular-nums text-white">
            {search.cashOffers.length} cash · {search.awardOffers.length} award
          </p>
          <p className="text-[10px] text-sky-100/70">
            Duffel {search.meta.duffelConfigured ? "live" : "off"} · Seats.aero{" "}
            {search.meta.seatsAeroConfigured ? "live" : "off"}
          </p>
        </div>
      </div>

      {best ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-600 bg-[#152238]/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Live cash</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-100">
              {best.cashOffer ? `$${best.cashOffer.totalUsd.toLocaleString()}` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {best.cashOffer?.airline ?? "No Duffel quote"} · {best.cashOffer?.stops ?? 0} stop
              {(best.cashOffer?.stops ?? 0) === 1 ? "" : "s"}
            </p>
          </article>
          <article className={`rounded-2xl border p-4 ${verdictTone(best.verdict)}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Kepi verdict</p>
            <p className="mt-1 text-sm font-black">{verdictLabel(best.verdict)}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">
              {best.awardOffer
                ? `${best.milesRequired.toLocaleString()} mi`
                : best.cashOffer
                  ? `$${best.cashUsd.toLocaleString()}`
                  : "—"}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {best.cpp > 0 ? `${best.cpp.toFixed(1)}¢/pt · ` : null}
              {best.savingsUsd > 0 ? `~$${best.savingsUsd.toLocaleString()} vs cash · ` : null}
              {best.reasoning}
            </p>
            {best.awardOffer?.verifyUrl ? (
              <a
                href={best.awardOffer.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[11px] font-bold underline opacity-90 hover:opacity-100"
              >
                Verify on Seats.aero →
              </a>
            ) : null}
          </article>
        </div>
      ) : null}

      {search.fused.length > 1 ? (
        <ul className="mt-4 space-y-2">
          {search.fused.slice(1, 4).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/80 bg-[#152238]/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{row.headline}</p>
                <p className="truncate text-[10px] text-slate-400">{verdictLabel(row.verdict)}</p>
              </div>
              <p className="shrink-0 text-sm font-black tabular-nums text-slate-200">
                {row.awardOffer ? `${row.milesRequired.toLocaleString()} mi` : `$${row.cashUsd.toLocaleString()}`}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
