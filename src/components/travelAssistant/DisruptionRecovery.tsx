"use client";

import { useTranslations } from "next-intl";
import type { IncidentAutopilotAction, IncidentAutopilotRecommendation } from "@/lib/travelAssistant/incidentAutopilot";
import { showDisruptionLabControls } from "@/lib/travelAssistant/disruptionCalm";

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
  const t = useTranslations("DisruptionRecovery");

  if (!showRecoverySection) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        {t("hiddenMessage")}
      </section>
    );
  }

  return (
    <section data-testid="disruption-recovery-panel" className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("subtitle")}</p>
      {showDisruptionLabControls() ? (
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSimulateDisruption("missed-flight")}
          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-red-400"
        >
          {t("simulateMissedFlight")}
        </button>
        <button
          type="button"
          onClick={() => onSimulateDisruption("train-delay")}
          className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400"
        >
          {t("simulateTrainDelay")}
        </button>
        <button
          type="button"
          onClick={() => onSimulateDisruption("ride-no-show")}
          className="rounded-lg bg-red-500/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-red-400"
        >
          {t("simulateRideNoShow")}
        </button>
        <button
          type="button"
          onClick={onClearSimulation}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
        >
          {t("clearSimulation")}
        </button>
      </div>
      ) : null}
      <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-100/60 p-3 dark:bg-violet-500/10">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">{t("autopilotTitle")}</p>
        <p className="text-xs text-violet-800 dark:text-violet-100/80">
          {t("autopilotSubtitle")}
        </p>
        {lastAppliedAutopilotRecommendationTitle ? (
          <p data-testid="autopilot-last-applied" className="mt-2 text-xs text-emerald-200">
            {t("applied", { title: lastAppliedAutopilotRecommendationTitle })}
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
                      {recommendation.priority === "critical"
                        ? t("priorityCritical")
                        : recommendation.priority === "high"
                          ? t("priorityHigh")
                          : t("priorityMedium")}
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
                    {autopilotActionPending === recommendation.action ? t("applying") : t("applyNow")}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{recommendation.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-800 dark:text-emerald-100">
            {t("autopilotClear")}
          </p>
        )}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("whoToCall")}</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <li>{t("callStepOne")}</li>
            <li>{t("callStepTwo")}</li>
            <li>{t("callStepThree")}</li>
            <li>{t("callStepFour")}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("whatToSay")}</p>
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{recoveryScript}</p>
          <button
            type="button"
            onClick={() => onCopyScript(recoveryScript)}
            className="mt-3 rounded-md bg-slate-200 px-2.5 py-1.5 text-xs ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
          >
            {t("copyScript")}
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
