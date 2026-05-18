"use client";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type DemoPresetId = "smooth-trip" | "moderate-delay" | "severe-disruption";
type MobileViewPanel = "essentials" | "timeline" | "recovery" | "family" | "all";

interface DemoPresetConfig {
  id: DemoPresetId;
  label: string;
  summary: string;
}

interface TripOrientationCardProps {
  tripStage: TripStage;
  nextStage: TripStage;
  stageLabelByTripStage: Record<TripStage, string>;
  nextBestFlowAction: string;
  nextStageAction: string;
  onAdvanceTripStage: () => void;
  lastDemoPresetAppliedAt: string | null;
  lastDemoPresetId: DemoPresetId | null;
  demoPresets: DemoPresetConfig[];
  onApplyDemoPreset: (presetId: DemoPresetId) => void;
  formatClock: (value: string | null) => string;
  isCompactViewport: boolean;
  mobileSimpleView: boolean;
  mobileViewPanel: MobileViewPanel;
  onToggleMobileSimpleView: () => void;
  onMobileViewPanelChange: (panel: Exclude<MobileViewPanel, "all">) => void;
}

export function TripOrientationCard({
  tripStage,
  nextStage,
  stageLabelByTripStage,
  nextBestFlowAction,
  nextStageAction,
  onAdvanceTripStage,
  lastDemoPresetAppliedAt,
  lastDemoPresetId,
  demoPresets,
  onApplyDemoPreset,
  formatClock,
  isCompactViewport,
  mobileSimpleView,
  mobileViewPanel,
  onToggleMobileSimpleView,
  onMobileViewPanelChange,
}: TripOrientationCardProps) {
  return (
    <>
      <section
        data-testid="trip-orientation-card"
        className="rounded-2xl border border-cyan-500/30 bg-cyan-100/60 p-3 dark:bg-cyan-500/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">Trip snapshot: where you are + what is next</p>
          <button
            data-testid="advance-stage-button"
            type="button"
            onClick={onAdvanceTripStage}
            className="rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Move to next stage
          </button>
        </div>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Where you are</p>
            <p data-testid="trip-current-stage" role="status" className="mt-1 font-semibold">
              {stageLabelByTripStage[tripStage]}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{nextBestFlowAction}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">What is next</p>
            <p className="mt-1 font-semibold">
              {nextStage === tripStage ? "Stay in recovery and stabilize" : stageLabelByTripStage[nextStage]}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{nextStageAction}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-100/70 p-2 dark:border-slate-700 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">Demo mode presets</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {lastDemoPresetAppliedAt
                ? `Last preset: ${lastDemoPresetId ?? "n/a"} at ${formatClock(lastDemoPresetAppliedAt)}`
                : "No preset applied yet."}
            </p>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {demoPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyDemoPreset(preset.id)}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs ring-1 transition ${
                  lastDemoPresetId === preset.id
                    ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-900 ring-cyan-400/50 dark:text-cyan-100"
                    : "border-slate-300 bg-white text-slate-800 ring-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                <p className="font-semibold">{preset.label}</p>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{preset.summary}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {isCompactViewport ? (
        <section className="rounded-xl border border-slate-200 bg-white/80 p-2 md:hidden dark:border-slate-700 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-200">Mobile view</p>
            <button
              type="button"
              onClick={onToggleMobileSimpleView}
              aria-expanded={mobileSimpleView}
              className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-700"
            >
              {mobileSimpleView ? "Show full app" : "Use simple view"}
            </button>
          </div>
          {mobileSimpleView ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                ["essentials", "Essentials"],
                ["timeline", "Timeline"],
                ["recovery", "Recovery"],
                ["family", "Family"],
              ] as const).map(([panel, label]) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => onMobileViewPanelChange(panel)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ${
                    mobileViewPanel === panel
                      ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                      : "bg-slate-200 text-slate-900 ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            {mobileSimpleView ? `Showing ${mobileViewPanel} only to reduce clutter.` : "Full layout enabled on mobile."}
          </p>
        </section>
      ) : null}
    </>
  );
}
