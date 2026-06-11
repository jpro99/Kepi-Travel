"use client";

import type { TravelStrategy } from "@/lib/decision/types";

interface DecisionConstellationProps {
  strategies: TravelStrategy[];
  comfortWeight: number;
}

export function DecisionConstellation({ strategies, comfortWeight }: DecisionConstellationProps) {
  if (strategies.length === 0) return null;

  const maxCost = Math.max(...strategies.map((s) => s.scores.trueOutOfPocket), 1);
  const minCost = Math.min(...strategies.map((s) => s.scores.trueOutOfPocket));
  const costRange = maxCost - minCost || 1;

  const width = 280;
  const height = 160;
  const pad = 24;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Decision map · comfort {(comfortWeight * 100).toFixed(0)}%
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" aria-hidden>
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          x1={pad}
          y1={pad}
          x2={pad}
          y2={height - pad}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <text x={width / 2} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[8px]">
          True cost →
        </text>
        <text
          x={8}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 8 ${height / 2})`}
          className="fill-muted-foreground text-[8px]"
        >
          Comfort
        </text>
        {strategies.map((s) => {
          const x =
            pad +
            ((s.scores.trueOutOfPocket - minCost) / costRange) * (width - pad * 2);
          const y =
            height -
            pad -
            (s.scores.comfortScore / 100) * (height - pad * 2);
          const r = s.recommended ? 10 : 7;
          return (
            <g key={s.id}>
              <circle
                cx={x}
                cy={y}
                r={r}
                className={s.recommended ? "fill-emerald-400" : "fill-sky-400/80"}
                opacity={0.9}
              />
              <text
                x={x}
                y={y - r - 4}
                textAnchor="middle"
                className="fill-foreground text-[7px] font-medium"
              >
                {s.title.split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
