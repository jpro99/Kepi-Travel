"use client";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type TripStatus = "green" | "yellow" | "red";
type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";
type GuidanceTone = "subtle" | "standard";
type MobileViewPanel = "essentials" | "timeline" | "recovery" | "family" | "all";
type DemoPresetId = "smooth-trip" | "moderate-delay" | "severe-disruption";

interface DemoPresetConfig {
  id: DemoPresetId;
  label: string;
  summary: string;
}

interface TravelAssistantTopControlsProps {
  tripStatus: TripStatus;
  statusBadgeByTripStatus: Record<TripStatus, string>;
  statusLabelByTripStatus: Record<TripStatus, string>;
  tripStage: TripStage;
  stageLabelByTripStage: Record<TripStage, string>;
  leaveByMinutes: number;
  reviewQueueLength: number;
  operationalConfidenceScore: number;
  blockingIssueCount: number;
  guidanceTone: GuidanceTone;
  suppressedNudgeCount: number;
  lastSessionRestoreAt: string | null;
  formatClock: (value: string | null) => string;
  onTripStageChange: (nextStage: TripStage) => void;
  onTripStatusChange: (nextStatus: TripStatus) => void;
  onGuidanceToneChange: (nextTone: GuidanceTone) => void;
  minutesToDeparture: number;
  onMinutesToDepartureChange: (minutes: number) => void;
  onEvaluateStatus: () => void;
  onRunSmartEscalation: () => void;
  onTriggerReminderDispatch: () => void;
  onFlushPendingSync: () => void;
  personalTimelineOnly: boolean;
  onTogglePersonalTimelineOnly: () => void;
  onAdvanceTripStage: () => void;
  onUndoLastCriticalChange: () => void;
  stageFocusMode: boolean;
  onToggleStageFocusMode: () => void;
  quickAddText: string;
  onQuickAddTextChange: (nextText: string) => void;
  quickAddType: ReservationType;
  reservationTypeLabelByType: Record<ReservationType, string>;
  onQuickAddTypeChange: (nextType: ReservationType) => void;
  quickAddConfidence: Confidence;
  onQuickAddConfidenceChange: (nextConfidence: Confidence) => void;
  onVoiceQuickCapture: () => void;
  onQuickAdd: (source: "email-paste" | "manual") => void;
  undoStackLength: number;
  nextBestFlowAction: string;
  nextStage: TripStage;
  nextStageAction: string;
  lastDemoPresetAppliedAt: string | null;
  lastDemoPresetId: DemoPresetId | null;
  demoPresets: DemoPresetConfig[];
  onApplyDemoPreset: (presetId: DemoPresetId) => void;
  isCompactViewport: boolean;
  mobileSimpleView: boolean;
  mobileViewPanel: MobileViewPanel;
  onToggleMobileSimpleView: () => void;
  onMobileViewPanelChange: (panel: Exclude<MobileViewPanel, "all">) => void;
}

const TRIP_STAGES: TripStage[] = ["readiness", "pre-departure", "airport", "arrival", "recovery"];
const TRIP_STATUS_OPTIONS: TripStatus[] = ["green", "yellow", "red"];
const MOBILE_PANEL_OPTIONS: Array<{ panel: Exclude<MobileViewPanel, "all">; label: string }> = [
  { panel: "essentials", label: "Essentials" },
  { panel: "timeline", label: "Timeline" },
  { panel: "recovery", label: "Recovery" },
  { panel: "family", label: "Family" },
];

export function TravelAssistantTopControls({
  tripStatus,
  statusBadgeByTripStatus,
  statusLabelByTripStatus,
  tripStage,
  stageLabelByTripStage,
  leaveByMinutes,
  reviewQueueLength,
  operationalConfidenceScore,
  blockingIssueCount,
  guidanceTone,
  suppressedNudgeCount,
  lastSessionRestoreAt,
  formatClock,
  onTripStageChange,
  onTripStatusChange,
  onGuidanceToneChange,
  minutesToDeparture,
  onMinutesToDepartureChange,
  onEvaluateStatus,
  onRunSmartEscalation,
  onTriggerReminderDispatch,
  onFlushPendingSync,
  personalTimelineOnly,
  onTogglePersonalTimelineOnly,
  onAdvanceTripStage,
  onUndoLastCriticalChange,
  stageFocusMode,
  onToggleStageFocusMode,
  quickAddText,
  onQuickAddTextChange,
  quickAddType,
  reservationTypeLabelByType,
  onQuickAddTypeChange,
  quickAddConfidence,
  onQuickAddConfidenceChange,
  onVoiceQuickCapture,
  onQuickAdd,
  undoStackLength,
  nextBestFlowAction,
  nextStage,
  nextStageAction,
  lastDemoPresetAppliedAt,
  lastDemoPresetId,
  demoPresets,
  onApplyDemoPreset,
  isCompactViewport,
  mobileSimpleView,
  mobileViewPanel,
  onToggleMobileSimpleView,
  onMobileViewPanelChange,
}: TravelAssistantTopControlsProps) {
  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 shadow-2xl shadow-indigo-950/30">
        <div className="grid gap-5 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[1.8fr_1fr]">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Adaptive Travel Assistant</p>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              Premium trip execution for families, with anti-miss safeguards.
            </h1>
            <p className="max-w-3xl text-sm text-slate-300">
              Stage-adaptive controls, confidence-aware imports, recovery playbooks, static exports, and consent-based
              family location sharing.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${statusBadgeByTripStatus[tripStatus]}`}>
                {statusLabelByTripStatus[tripStatus]} ({tripStatus.toUpperCase()})
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                Stage: {stageLabelByTripStage[tripStage]}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                Leave-by buffer: {leaveByMinutes} min
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                Review queue: {reviewQueueLength}
              </span>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-indigo-100 ring-1 ring-indigo-300/40">
                Confidence score: {operationalConfidenceScore}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                Blocking issues: {blockingIssueCount}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                Nudges: {guidanceTone} • filtered {suppressedNudgeCount}
              </span>
              {lastSessionRestoreAt ? (
                <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-100 ring-1 ring-violet-400/40">
                  Session restored: {formatClock(lastSessionRestoreAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-slate-100">Trip-state editor (live)</p>
            <p className="mt-1 text-xs text-slate-400">Controls update status and screens in real time.</p>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Operational confidence</span>
                <span>{operationalConfidenceScore}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${
                    operationalConfidenceScore >= 80
                      ? "bg-emerald-400"
                      : operationalConfidenceScore >= 60
                        ? "bg-amber-400"
                        : "bg-red-400"
                  }`}
                  style={{ width: `${operationalConfidenceScore}%` }}
                />
              </div>
            </div>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-slate-300">Trip stage</span>
                <select
                  value={tripStage}
                  onChange={(event) => onTripStageChange(event.target.value as TripStage)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  {TRIP_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabelByTripStage[stage]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Trip status</span>
                <select
                  value={tripStatus}
                  onChange={(event) => onTripStatusChange(event.target.value as TripStatus)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  {TRIP_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {statusLabelByTripStatus[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Guidance tone</span>
                <select
                  value={guidanceTone}
                  onChange={(event) => onGuidanceToneChange(event.target.value as GuidanceTone)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  <option value="subtle">Subtle (reduced interruption)</option>
                  <option value="standard">Standard</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Subtle mode deduplicates repeated nudges and slows non-critical prompts.
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Minutes to departure-critical event</span>
                <input
                  type="range"
                  min={20}
                  max={360}
                  value={minutesToDeparture}
                  onChange={(event) => onMinutesToDepartureChange(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-1 text-xs text-slate-400">{minutesToDeparture} minutes</div>
              </label>
              <button
                type="button"
                onClick={onEvaluateStatus}
                className="w-full rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
              >
                Auto-evaluate status from risk
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-2 z-20 -mx-1 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-2 backdrop-blur md:static md:mx-0">
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={onEvaluateStatus}
            className="shrink-0 rounded-full bg-cyan-500/90 px-3 py-1.5 font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Auto-evaluate
          </button>
          <button
            type="button"
            onClick={onRunSmartEscalation}
            className="shrink-0 rounded-full bg-indigo-500/90 px-3 py-1.5 font-semibold text-slate-100 hover:bg-indigo-400"
          >
            Smart escalation
          </button>
          <button
            type="button"
            onClick={onTriggerReminderDispatch}
            className="shrink-0 rounded-full bg-amber-500/90 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-400"
          >
            Dispatch reminders
          </button>
          <button
            type="button"
            onClick={onFlushPendingSync}
            className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 font-semibold ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Sync now
          </button>
          <button
            type="button"
            onClick={onTogglePersonalTimelineOnly}
            className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 font-semibold ring-1 ring-slate-700 hover:bg-slate-700"
          >
            {personalTimelineOnly ? "Show group timeline" : "Show my timeline"}
          </button>
          <button
            type="button"
            onClick={onAdvanceTripStage}
            className="shrink-0 rounded-full bg-emerald-500/80 px-3 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Advance stage
          </button>
          <button
            type="button"
            onClick={onUndoLastCriticalChange}
            className="shrink-0 rounded-full bg-rose-500/85 px-3 py-1.5 font-semibold text-slate-950 hover:bg-rose-400"
          >
            Undo critical change
          </button>
          <button
            type="button"
            onClick={onToggleStageFocusMode}
            className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 font-semibold ring-1 ring-slate-700 hover:bg-slate-700"
          >
            {stageFocusMode ? "Show all panels" : "Focus mode"}
          </button>
        </div>
        <div className="mt-2 hidden gap-2 rounded-xl border border-slate-700 bg-slate-950/60 p-2 md:grid md:grid-cols-[1.4fr_auto_auto_auto]">
          <input
            type="text"
            value={quickAddText}
            onChange={(event) => onQuickAddTextChange(event.target.value)}
            placeholder="Universal quick add: paste email line or type a manual update"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
          />
          <select
            value={quickAddType}
            onChange={(event) => onQuickAddTypeChange(event.target.value as ReservationType)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs"
          >
            {(Object.keys(reservationTypeLabelByType) as ReservationType[]).map((type) => (
              <option key={type} value={type}>
                {reservationTypeLabelByType[type]}
              </option>
            ))}
          </select>
          <select
            value={quickAddConfidence}
            onChange={(event) => onQuickAddConfidenceChange(event.target.value as Confidence)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs"
          >
            <option value="high">High confidence</option>
            <option value="medium">Medium confidence</option>
            <option value="low">Low confidence</option>
          </select>
          <button
            type="button"
            onClick={onVoiceQuickCapture}
            className="rounded-lg bg-violet-500/85 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-violet-400"
          >
            Voice
          </button>
          <button
            type="button"
            onClick={() => onQuickAdd("email-paste")}
            className="rounded-lg bg-cyan-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Add as email
          </button>
          <button
            type="button"
            onClick={() => onQuickAdd("manual")}
            className="rounded-lg bg-emerald-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400"
          >
            Add manual
          </button>
          <p className="self-center text-[11px] text-slate-400 md:col-span-2">
            Low-confidence quick adds are automatically routed to review queue before live itinerary.
          </p>
          <p className="self-center text-[11px] text-slate-400">Undo ready: {undoStackLength}</p>
        </div>
        <div className="mt-2 space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-2 md:hidden">
          <input
            type="text"
            value={quickAddText}
            onChange={(event) => onQuickAddTextChange(event.target.value)}
            placeholder="Quick add: paste or type one update"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onVoiceQuickCapture}
              className="rounded-lg bg-violet-500/85 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-violet-400"
            >
              Voice
            </button>
            <button
              type="button"
              onClick={() => onQuickAdd("manual")}
              className="rounded-lg bg-emerald-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400"
            >
              Add now
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Simple mode keeps only key actions visible on phone.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-cyan-100">Trip snapshot: where you are + what is next</p>
          <button
            type="button"
            onClick={onAdvanceTripStage}
            className="rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Move to next stage
          </button>
        </div>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">Where you are</p>
            <p className="mt-1 font-semibold">{stageLabelByTripStage[tripStage]}</p>
            <p className="mt-1 text-xs text-slate-300">{nextBestFlowAction}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">What is next</p>
            <p className="mt-1 font-semibold">
              {nextStage === tripStage ? "Stay in recovery and stabilize" : stageLabelByTripStage[nextStage]}
            </p>
            <p className="mt-1 text-xs text-slate-300">{nextStageAction}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-200">Demo mode presets</p>
            <p className="text-[11px] text-slate-400">
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
                    ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100 ring-cyan-400/50"
                    : "border-slate-700 bg-slate-900 text-slate-200 ring-slate-700 hover:bg-slate-800"
                }`}
              >
                <p className="font-semibold">{preset.label}</p>
                <p className="mt-1 text-[11px] text-slate-300">{preset.summary}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {isCompactViewport ? (
        <section className="rounded-xl border border-slate-700 bg-slate-900/80 p-2 md:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-200">Mobile view</p>
            <button
              type="button"
              onClick={onToggleMobileSimpleView}
              className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-slate-700"
            >
              {mobileSimpleView ? "Show full app" : "Use simple view"}
            </button>
          </div>
          {mobileSimpleView ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {MOBILE_PANEL_OPTIONS.map((option) => (
                <button
                  key={option.panel}
                  type="button"
                  onClick={() => onMobileViewPanelChange(option.panel)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ${
                    mobileViewPanel === option.panel
                      ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                      : "bg-slate-800 text-slate-100 ring-slate-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-400">
            {mobileSimpleView ? `Showing ${mobileViewPanel} only to reduce clutter.` : "Full layout enabled on mobile."}
          </p>
        </section>
      ) : null}
    </>
  );
}
