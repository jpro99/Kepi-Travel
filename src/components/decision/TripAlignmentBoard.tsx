"use client";

import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import { countVerifiedLegs } from "@/lib/decision/tripAlignment";

const STATUS_STYLE: Record<
  AlignmentLeg["status"],
  { dot: string; border: string; bg: string; text: string }
> = {
  verified: {
    dot: "bg-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-950/30",
    text: "text-emerald-100",
  },
  estimated: {
    dot: "bg-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-950/30",
    text: "text-amber-100",
  },
  recommended_skip: {
    dot: "bg-slate-400",
    border: "border-slate-500/40",
    bg: "bg-slate-800/50",
    text: "text-slate-300",
  },
  modeled: {
    dot: "bg-sky-400",
    border: "border-sky-500/40",
    bg: "bg-sky-950/30",
    text: "text-sky-100",
  },
};

interface TripAlignmentBoardProps {
  legs: AlignmentLeg[];
  strategyTitle?: string;
  compact?: boolean;
}

export function TripAlignmentBoard({ legs, strategyTitle, compact = false }: TripAlignmentBoardProps) {
  if (legs.length === 0) return null;

  const { verified, total } = countVerifiedLegs(legs);

  return (
    <section className={`rounded-2xl border border-slate-600 bg-[#152238] ${compact ? "px-4 py-3" : "px-4 py-4"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Trip alignment</p>
          {!compact && strategyTitle ? (
            <p className="mt-0.5 text-xs text-slate-300">{strategyTitle}</p>
          ) : null}
        </div>
        <p className="text-xs font-bold text-slate-200">
          {verified}/{total} legs live-verified
        </p>
      </div>

      <ul className={`space-y-2 ${compact ? "mt-2" : "mt-3"}`}>
        {legs.map((leg) => {
          const style = STATUS_STYLE[leg.status];
          return (
            <li
              key={leg.id}
              className={`rounded-xl border px-3 py-2.5 ${style.border} ${style.bg}`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{leg.label}</p>
                  <p className={`mt-0.5 text-xs ${style.text}`}>{leg.statusLabel}</p>
                  {!compact && leg.detail ? (
                    <p className="mt-1 text-xs text-slate-400">{leg.detail}</p>
                  ) : null}
                  {leg.priceUsd !== undefined ? (
                    <p className="mt-1 text-xs font-bold text-slate-200">
                      ${leg.priceUsd.toLocaleString()}
                      {leg.status === "verified" ? " · when Kepi searched" : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
