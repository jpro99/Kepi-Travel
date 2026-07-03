"use client";

import type { TravelStrategy } from "@/lib/decision/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

interface StrategyCardProps {
  strategy: TravelStrategy;
  rank: number;
  expanded: boolean;
  activating: boolean;
  onToggle: () => void;
  onActivate: () => void;
  // Optional extra props passed by CommandDeck — accepted but not required
  index?: number;
  compareLoading?: boolean;
  bestLiveFare?: number | null;
  liveConfigured?: boolean;
  expertMode?: boolean;
  hideCompareDates?: boolean;
  onCompareDates?: () => void;
}

export function StrategyCard({
  strategy,
  rank,
  expanded,
  activating,
  onToggle,
  onActivate,
}: StrategyCardProps) {
  const costLabel = strategy.scores.trueOutOfPocket
    ? `$${strategy.scores.trueOutOfPocket.toLocaleString()}`
    : null;

  return (
    <article
      className={cn(
        "rounded-2xl border transition-all duration-200",
        strategy.recommended
          ? "border-emerald-500/50 bg-gradient-to-br from-emerald-950/20 to-card shadow-lg"
          : "border-border/70 bg-card/60",
      )}
    >
      {/* Always-visible tap target — expands details */}
      <button
        type="button"
        className="w-full px-5 py-4 text-left active:opacity-70"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {strategy.recommended && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  <Sparkles className="h-3 w-3" /> Best pick
                </span>
              )}
              {costLabel && (
                <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-bold text-white">
                  {costLabel}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white">{strategy.title}</h3>
            <p className="mt-0.5 text-sm text-slate-300 line-clamp-2">{strategy.headline}</p>
          </div>
          <div className="shrink-0 mt-1 text-slate-400">
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </button>

      {/* Always-visible Book button — no expand required */}
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={onActivate}
          disabled={activating}
          className={cn(
            "w-full rounded-xl py-3 text-sm font-bold transition active:opacity-80",
            strategy.recommended
              ? "bg-emerald-500 text-white disabled:opacity-50"
              : "bg-amber-400 text-[#0b1f3a] disabled:opacity-50",
          )}
        >
          {activating ? "Setting up your trip…" : "Build this trip →"}
        </button>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border/30 px-5 pb-5 pt-3">
          <p className="text-xs text-slate-400 leading-relaxed mb-3">{strategy.reasoning}</p>
          <ol className="space-y-2">
            {strategy.segments.map((seg, i) => (
              <li key={i} className="flex justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium text-white">{seg.label}</span>
                  {seg.detail && (
                    <span className="block text-xs text-slate-400 mt-0.5">{seg.detail}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-slate-300 text-xs">
                  {seg.milesUsed ? `${(seg.milesUsed / 1000).toFixed(0)}k pts` : seg.costUsd ? `$${seg.costUsd}` : ""}
                </span>
              </li>
            ))}
          </ol>

          {strategy.preCrimeWarnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {strategy.preCrimeWarnings.map((w) => (
                <p key={w} className="flex items-start gap-2 text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
