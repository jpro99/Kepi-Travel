"use client";

import type { StrategyFlexOption, StrategyFlexOptionsResult } from "@/lib/decision/types";

const SOURCE_LABEL: Record<string, string> = {
  live: "Live Duffel",
  estimated: "Modeled",
  mixed: "Live + est. award",
};

interface StrategyFlexModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: StrategyFlexOptionsResult | null;
  onClose: () => void;
}

function OptionCard({ option }: { option: StrategyFlexOption }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#f4c95d]">
            #{option.rank} · {option.dateLabel}
          </p>
          <h4 className="mt-1 text-base font-bold text-white">{option.headline}</h4>
        </div>
        <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold uppercase text-white/70">
          {SOURCE_LABEL[option.pricingSource] ?? option.pricingSource}
        </span>
      </div>

      <p className="mt-2 text-sm text-white/65">{option.detail}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white">
          ${option.trueOutOfPocket.toLocaleString()} true cost
        </span>
        {option.milesUsed !== undefined && (
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/85">
            {option.milesUsed.toLocaleString()} mi
            {option.centsPerMile !== undefined ? ` · ${option.centsPerMile}¢/mi` : ""}
          </span>
        )}
        {option.cashFareUsd !== undefined && (
          <span className="rounded-lg bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
            ${option.cashFareUsd.toLocaleString()} fare
          </span>
        )}
        {option.savingsVsBaseline !== undefined && option.savingsVsBaseline > 0 && (
          <span className="rounded-lg bg-sky-400/15 px-2.5 py-1 text-xs font-bold text-sky-200">
            saves ~${option.savingsVsBaseline.toLocaleString()} vs your date
          </span>
        )}
      </div>

      {option.benchmarkNote && (
        <p className="mt-2 text-[11px] leading-relaxed text-white/50">{option.benchmarkNote}</p>
      )}

      {option.verifyUrl && (
        <a
          href={option.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-xs font-bold text-sky-300 hover:text-sky-200"
        >
          Verify award on Seats.aero →
        </a>
      )}
    </article>
  );
}

export function StrategyFlexModal({ open, loading, error, data, onClose }: StrategyFlexModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flex-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-[#0b1f3a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Date flex · top 3</p>
            <h3 id="flex-modal-title" className="mt-1 text-xl font-bold text-white">
              {data?.strategyTitle ?? "Loading options…"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        {loading && (
          <p className="mt-6 text-sm font-medium text-white/60">Searching nearby dates…</p>
        )}

        {error && (
          <p className="mt-6 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200">{error}</p>
        )}

        {data && !loading && (
          <>
            <p className="mt-3 text-xs leading-relaxed text-white/55">{data.notice}</p>
            <div className="mt-4 space-y-3">
              {data.options.map((option) => (
                <OptionCard key={`${option.departureDate}-${option.rank}`} option={option} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
