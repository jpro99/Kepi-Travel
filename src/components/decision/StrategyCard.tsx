"use client";

import type { TravelStrategy } from "@/lib/decision/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StrategyCardProps {
  strategy: TravelStrategy;
  rank: number;
  expanded: boolean;
  activating: boolean;
  onToggle: () => void;
  onActivate: () => void;
}

export function StrategyCard({
  strategy,
  rank,
  expanded,
  activating,
  onToggle,
  onActivate,
}: StrategyCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border transition-all duration-300",
        strategy.recommended
          ? "border-emerald-500/50 bg-gradient-to-br from-emerald-950/20 to-card shadow-lg shadow-emerald-900/10"
          : "border-border/70 bg-card/60 hover:border-border",
      )}
    >
      <button
        type="button"
        className="w-full px-5 py-4 text-left"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              {strategy.recommended && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  <Sparkles className="h-3 w-3" /> Recommended
                </span>
              )}
              <span className="text-xs text-muted-foreground">#{rank}</span>
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{strategy.title}</h3>
            <p className="mt-1 text-sm font-medium text-foreground/90">{strategy.headline}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-emerald-400">{strategy.scores.tvs}</p>
            <p className="text-xs text-muted-foreground">TVS</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{strategy.reasoning}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-secondary px-2 py-1">
            ${strategy.scores.trueOutOfPocket.toLocaleString()} true cost
          </span>
          <span className="rounded-md bg-secondary px-2 py-1">
            {strategy.scores.frictionMinutes}m friction
          </span>
          {strategy.segments.some((s) => s.cpp) && (
            <span className="rounded-md bg-secondary px-2 py-1">
              {strategy.segments.find((s) => s.cpp)?.cpp}¢/mi
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-5 pb-5 pt-3">
          <ol className="space-y-2">
            {strategy.segments.map((seg, i) => (
              <li key={i} className="flex justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">{seg.label}</span>
                  <span className="block text-muted-foreground">{seg.detail}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {seg.milesUsed ? `${(seg.milesUsed / 1000).toFixed(0)}k pts` : `$${seg.costUsd}`}
                </span>
              </li>
            ))}
          </ol>

          {strategy.instrumentsUsed.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {strategy.instrumentsUsed.map((inst) => (
                <li key={inst.instrumentId} className="flex items-center gap-2">
                  {inst.optimal ? "✓" : "○"} {inst.label}
                  {inst.warning && (
                    <span className="text-amber-500/90">({inst.warning})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {strategy.preCrimeWarnings.map((w) => (
            <p key={w} className="mt-3 flex items-start gap-2 text-xs text-amber-500/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}

          <Button
            className="mt-4 w-full"
            onClick={onActivate}
            disabled={activating}
          >
            {activating ? "Activating trip…" : "Activate this strategy"}
          </Button>
        </div>
      )}
    </article>
  );
}
