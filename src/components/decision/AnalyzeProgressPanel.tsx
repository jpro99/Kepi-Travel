"use client";

const FLIGHT_STEPS = [
  "Understanding your trip…",
  "Kepi Optimal Search — trip shapes & live Duffel fares…",
  "Cash vs points — Seats.aero award inventory…",
  "Ranking strategies & hotel estimates…",
] as const;

const HOTEL_STEPS = ["Understanding your trip…", "Finding ranked hotels for your cities…"] as const;

interface AnalyzeProgressPanelProps {
  planMode: "flights" | "hotels" | "full";
  stepIndex: number;
}

export function AnalyzeProgressPanel({ planMode, stepIndex }: AnalyzeProgressPanelProps) {
  const steps = planMode === "hotels" ? HOTEL_STEPS : FLIGHT_STEPS;
  const clampedStep = Math.min(stepIndex, steps.length - 1);
  const progressPct = Math.min(96, Math.round(((clampedStep + 1) / steps.length) * 100));

  return (
    <div className="rounded-3xl border border-[#f4c95d]/30 bg-[#152238] p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">Analyzing</p>
        <p className="text-[10px] font-bold tabular-nums text-slate-400">
          Step {clampedStep + 1}/{steps.length}
        </p>
      </div>
      <p
        className="mt-3 text-sm font-bold leading-snug text-white"
        style={{ animation: "deckPulse 1.4s ease-in-out infinite" }}
      >
        {steps[clampedStep]}
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#f4c95d] to-sky-400 transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Optimal Search can run 40+ live fare checks — usually 15–35 seconds. Your results appear as soon as
        the math finishes.
      </p>
      <ul className="mt-3 space-y-1">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`text-[10px] ${
              index < clampedStep
                ? "text-emerald-300"
                : index === clampedStep
                  ? "font-bold text-white"
                  : "text-slate-500"
            }`}
          >
            {index < clampedStep ? "✓ " : index === clampedStep ? "→ " : "· "}
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
