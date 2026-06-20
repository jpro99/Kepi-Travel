"use client";

import { useEffect, useState } from "react";

const FLIGHT_STEPS = [
  { label: "Understanding your trip…", detail: "Parsing dates, airports, and route shape" },
  { label: "Building route options…", detail: "ONT · LAX · SNA + open-jaw variations" },
  { label: "Ranking cash, points & mix plays…", detail: "Scoring strategies by value per dollar" },
  { label: "Checking live fares…", detail: "Querying airlines · estimated prices shown if slow" },
] as const;

const FULL_TRIP_STEPS = [
  { label: "Understanding your trip…", detail: "Parsing dates, airports, stops" },
  { label: "Building route options…", detail: "Flight shapes + hotel city sequence" },
  { label: "Ranking flight plays…", detail: "Cash, points, and mix strategies" },
  { label: "Searching hotels…", detail: "Live rates for your cities" },
] as const;

const HOTEL_STEPS = [
  { label: "Understanding your trip…", detail: "Parsing cities and dates" },
  { label: "Finding ranked hotels…", detail: "Live rates + loyalty value" },
] as const;

interface AnalyzeProgressPanelProps {
  planMode: "flights" | "hotels" | "full";
  stepIndex: number;
}

export function AnalyzeProgressPanel({ planMode, stepIndex }: AnalyzeProgressPanelProps) {
  const steps = planMode === "hotels" ? HOTEL_STEPS : planMode === "full" ? FULL_TRIP_STEPS : FLIGHT_STEPS;
  const clampedStep = Math.min(stepIndex, steps.length - 1);
  const progressPct = Math.min(94, Math.round(((clampedStep + 0.6) / steps.length) * 100));

  // Animated dots for current step
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(t);
  }, []);

  const currentStep = steps[clampedStep];

  return (
    <div className="rounded-3xl border border-[#f4c95d]/30 bg-[#152238] p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f4c95d] animate-pulse" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">Analyzing</p>
        </div>
        <p className="text-[10px] font-bold tabular-nums text-slate-400">
          Step {clampedStep + 1}/{steps.length}
        </p>
      </div>

      {/* Current step headline */}
      <p className="mt-3 text-sm font-bold leading-snug text-white">
        {currentStep?.label.replace("…", dots)}
      </p>
      {currentStep?.detail && (
        <p className="mt-0.5 text-[11px] text-slate-400">{currentStep.detail}</p>
      )}

      {/* Progress bar */}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-700/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#f4c95d] to-sky-400 transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step list */}
      <ul className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const done = index < clampedStep;
          const active = index === clampedStep;
          return (
            <li key={step.label} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 text-[11px] font-bold ${
                done ? "text-emerald-400" : active ? "text-[#f4c95d]" : "text-slate-600"
              }`}>
                {done ? "✓" : active ? "›" : "·"}
              </span>
              <span className={`text-[11px] leading-snug ${
                done ? "text-emerald-300/80" : active ? "font-semibold text-white" : "text-slate-600"
              }`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
        Strategy pass returns first — live prices layer in as they arrive.
      </p>
    </div>
  );
}
