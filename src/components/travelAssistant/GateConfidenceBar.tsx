"use client";

import type { GateCoachState, GateConfidenceResult } from "@/lib/airportNav/gateConfidence";

const STATE_STYLES: Record<
  GateCoachState,
  { bar: string; clock: string; headline: string }
> = {
  fine: {
    bar: "border-emerald-400/35 bg-emerald-950/85",
    clock: "text-emerald-300",
    headline: "You're fine",
  },
  start_walking: {
    bar: "border-amber-400/35 bg-amber-950/85",
    clock: "text-amber-300",
    headline: "Start walking soon",
  },
  go_now: {
    bar: "border-orange-400/40 bg-orange-950/90",
    clock: "text-orange-200",
    headline: "Go now",
  },
  recover: {
    bar: "border-red-400/40 bg-red-950/90",
    clock: "text-red-200",
    headline: "Recover",
  },
};

export interface GateConfidenceBarProps {
  confidence: GateConfidenceResult;
  iata: string;
  flightLabel?: string | null;
  onShowMap?: () => void;
  mapVisible?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function GateConfidenceBar({
  confidence,
  iata,
  flightLabel,
  onShowMap,
  mapVisible = true,
  className = "",
  style,
}: GateConfidenceBarProps) {
  const styles = STATE_STYLES[confidence.state];
  const showCta = confidence.cta.kind === "show_map" && onShowMap && !mapVisible;

  return (
    <div
      data-testid="gate-confidence-bar"
      data-coach-state={confidence.state}
      className={`pointer-events-auto rounded-2xl border px-3.5 py-3 backdrop-blur-md shadow-lg ${styles.bar} ${className}`}
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
            {styles.headline} · {iata}
            {flightLabel ? ` · ${flightLabel}` : ""}
          </p>
          <p
            data-testid="gate-confidence-next-move"
            className="mt-1 text-[17px] font-black leading-snug text-white"
          >
            {confidence.nextMove}
          </p>
          {confidence.nextMoveDetail ? (
            <p className="mt-1 text-[12px] leading-snug text-white/75">{confidence.nextMoveDetail}</p>
          ) : null}
          {confidence.honestyNote ? (
            <p
              data-testid="gate-confidence-honesty"
              className="mt-1.5 text-[11px] leading-snug text-white/55"
            >
              {confidence.honestyNote}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p
            data-testid="gate-confidence-clock"
            className={`text-sm font-black uppercase tracking-wide ${styles.clock}`}
          >
            {confidence.clockLabel}
          </p>
        </div>
      </div>
      {showCta ? (
        <button
          type="button"
          data-testid="gate-confidence-cta"
          onClick={onShowMap}
          className="mt-2.5 w-full rounded-xl bg-white/12 px-3 py-2 text-[12px] font-bold text-white ring-1 ring-white/20 active:bg-white/20"
        >
          {confidence.cta.label}
        </button>
      ) : null}
    </div>
  );
}
