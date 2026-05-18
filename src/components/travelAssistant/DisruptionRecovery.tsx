"use client";

import type { IncidentAutopilotAction, IncidentAutopilotRecommendation } from "@/lib/travelAssistant/incidentAutopilot";

type DisruptionScenario = "missed-flight" | "train-delay" | "ride-no-show";

interface ActiveScenarioPlaybook {
  title: string;
  tone: string;
  steps: string[];
}

interface DisruptionRecoveryProps {
  showRecoverySection: boolean;
  onSimulateDisruption: (scenario: DisruptionScenario) => void;
  onClearSimulation: () => void;
  incidentAutopilotRecommendations: IncidentAutopilotRecommendation[];
  autopilotActionPending: IncidentAutopilotAction | null;
  onApplyIncidentAutopilotRecommendation: (recommendation: IncidentAutopilotRecommendation) => Promise<void>;
  lastAppliedAutopilotRecommendationTitle: string | null;
  recoveryScript: string;
  onCopyScript: (script: string) => void;
  activeScenarioPlaybook: ActiveScenarioPlaybook;
}

export function DisruptionRecovery({
  showRecoverySection,
  onSimulateDisruption,
  onClearSimulation,
  incidentAutopilotRecommendations,
  autopilotActionPending,
  onApplyIncidentAutopilotRecommendation,
  lastAppliedAutopilotRecommendationTitle,
  recoveryScript,
  onCopyScript,
  activeScenarioPlaybook,
}: DisruptionRecoveryProps) {
  if (!showRecoverySection) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        Recovery playbook is hidden by current focus or mobile view selection.
      </section>
    );
  }

  return (
    <section data-testid="disruption-recovery-panel" className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">Missed-flight / disruption recovery panel</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">Who to call, what to say, and decision path guidance by urgency level.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSimulateDisruption("missed-flight")}
          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-red-400"
        >
          Simulate missed flight
        </button>
        <button
          type="button"
          onClick={() => onSimulateDisruption("train-delay")}
          className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400"
        >
          Simulate train delay
        </button>
        <button
          type="button"
          onClick={() => onSimulateDisruption("ride-no-show")}
          className="rounded-lg bg-red-500/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-red-400"
        >
          Simulate ride no-show
        </button>
        <button
          type="button"
          onClick={onClearSimulation}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
        >
          Clear simulation
        </button>
      </div>
      <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-100/60 p-3 dark:bg-violet-500/10">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Incident autopilot recommendations</p>
        <p className="text-xs text-violet-800 dark:text-violet-100/80">
          One-tap remediation plan based on live trip risk, queue pressure, sync state, and worker health.
        </p>
        {lastAppliedAutopilotRecommendationTitle ? (
          <p data-testid="autopilot-last-applied" className="mt-2 text-xs text-emerald-200">
            Applied: {lastAppliedAutopilotRecommendationTitle}
          </p>
        ) : null}
        {incidentAutopilotRecommendations.length > 0 ? (
          <ul data-testid="autopilot-recommendation-list" className="mt-2 space-y-2 text-xs">
            {incidentAutopilotRecommendations.map((recommendation) => (
              <li
                key={recommendation.id}
                data-testid="autopilot-recommendation-item"
                className="rounded-lg border border-violet-400/30 bg-white px-3 py-2 text-slate-800 dark:bg-slate-950/70 dark:text-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        recommendation.priority === "critical"
                          ? "bg-red-500/20 text-red-800 dark:text-red-100"
                          : recommendation.priority === "high"
                            ? "bg-amber-500/20 text-amber-800 dark:text-amber-100"
                            : "bg-cyan-500/20 text-cyan-800 dark:text-cyan-100"
                      }`}
                    >
                      {recommendation.priority.toUpperCase()}
                    </span>
                    <span className="font-semibold">{recommendation.title}</span>
                  </div>
                  <button
                    data-testid={`autopilot-apply-${recommendation.id}`}
                    type="button"
                    onClick={() => {
                      void onApplyIncidentAutopilotRecommendation(recommendation);
                    }}
                    disabled={autopilotActionPending !== null}
                    className="rounded-md bg-violet-500/80 px-2.5 py-1 text-[11px] font-semibold text-slate-100 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {autopilotActionPending === recommendation.action ? "Applying..." : "Apply now"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{recommendation.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-800 dark:text-emerald-100">
            Autopilot sees no immediate incidents requiring intervention.
          </p>
        )}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Who to call now</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <li>1) Airline priority desk</li>
            <li>2) Hotel front desk (late arrival hold)</li>
            <li>3) Transfer provider</li>
            <li>4) Family coordinator</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">What to say (script)</p>
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{recoveryScript}</p>
          <button
            type="button"
            onClick={() => onCopyScript(recoveryScript)}
            className="mt-3 rounded-md bg-slate-200 px-2.5 py-1.5 text-xs ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
          >
            Copy script
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className={`text-sm font-semibold ${activeScenarioPlaybook.tone}`}>{activeScenarioPlaybook.title}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
            {activeScenarioPlaybook.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
