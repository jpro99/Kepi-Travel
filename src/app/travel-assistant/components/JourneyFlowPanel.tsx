"use client";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";

interface StageFlowCard {
  stage: TripStage;
  objective: string;
  easiestInput: string;
  mustConfirm: string;
  exitCheck: string;
}

interface UndoAuditEntry {
  id: string;
  action: string;
  undoneAt: string;
}

interface JourneyFlowPanelProps {
  stages: TripStage[];
  stageIndex: number;
  tripStage: TripStage;
  stageLabelByTripStage: Record<TripStage, string>;
  nextBestFlowAction: string;
  stageFlowCards: StageFlowCard[];
  onTripStageSelect: (stage: TripStage) => void;
  onVoiceQuickCapture: () => void;
  onImportAction: (target: "live" | "review") => void;
  onOpenTopReview: () => void;
  reviewQueueLength: number;
  voiceCaptureCount: number;
  lastVoiceCaptureAt: string | null;
  selectedEmailSubject: string;
  undoStackLength: number;
  undoAuditTrail: UndoAuditEntry[];
  formatClock: (value: string | null) => string;
}

export function JourneyFlowPanel({
  stages,
  stageIndex,
  tripStage,
  stageLabelByTripStage,
  nextBestFlowAction,
  stageFlowCards,
  onTripStageSelect,
  onVoiceQuickCapture,
  onImportAction,
  onOpenTopReview,
  reviewQueueLength,
  voiceCaptureCount,
  lastVoiceCaptureAt,
  selectedEmailSubject,
  undoStackLength,
  undoAuditTrail,
  formatClock,
}: JourneyFlowPanelProps) {
  return (
    <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.3fr_1fr]">
      <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Journey flow navigator</h2>
            <p className="text-xs text-slate-400">
              Start-to-finish operating map focused on easiest input, safety checks, and clean stage handoffs.
            </p>
          </div>
          <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/40">
            Progress {Math.round(((stageIndex + 1) / stages.length) * 100)}%
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {stages.map((stage, index) => (
            <button
              key={`flow-${stage}`}
              type="button"
              onClick={() => onTripStageSelect(stage)}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                stage === tripStage
                  ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                  : index <= stageIndex
                    ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/40"
                    : "bg-slate-800 text-slate-200 ring-slate-700 hover:bg-slate-700"
              }`}
            >
              {index + 1}. {stageLabelByTripStage[stage]}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Next best action</p>
          <p className="mt-1">{nextBestFlowAction}</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {stageFlowCards.map((card) => (
            <div
              key={`flow-card-${card.stage}`}
              className={`rounded-lg border p-3 text-xs ${
                card.stage === tripStage
                  ? "border-cyan-400/50 bg-slate-900 text-slate-100"
                  : "border-slate-700 bg-slate-950/60 text-slate-300"
              }`}
            >
              <p className="font-semibold">{stageLabelByTripStage[card.stage]}</p>
              <p className="mt-1 text-slate-300">{card.objective}</p>
              <p className="mt-1">
                <span className="text-slate-400">Easiest input:</span> {card.easiestInput}
              </p>
              <p className="mt-1">
                <span className="text-slate-400">Must confirm:</span> {card.mustConfirm}
              </p>
              <p className="mt-1">
                <span className="text-slate-400">Exit gate:</span> {card.exitCheck}
              </p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold">Quick input lane</h2>
        <p className="text-xs text-slate-400">
          Fastest ways to input while in motion: voice capture, email intake, and one-touch queue handling.
        </p>
        <div className="mt-3 space-y-2 text-xs">
          <button
            type="button"
            onClick={onVoiceQuickCapture}
            className="w-full rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-left text-violet-100 hover:bg-violet-500/25"
          >
            <p className="font-semibold">One-tap voice capture</p>
            <p className="text-violet-100/80">Stores spoken changes in review queue with safety checks.</p>
          </button>
          <button
            type="button"
            onClick={() => onImportAction("live")}
            className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-left text-emerald-100 hover:bg-emerald-500/25"
          >
            <p className="font-semibold">Accept selected email to live</p>
            <p className="text-emerald-100/80">Best for high-confidence confirmations.</p>
          </button>
          <button
            type="button"
            onClick={() => onImportAction("review")}
            className="w-full rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-left text-amber-100 hover:bg-amber-500/25"
          >
            <p className="font-semibold">Queue selected email for review</p>
            <p className="text-amber-100/80">Safer path when details are incomplete or uncertain.</p>
          </button>
          <button
            type="button"
            onClick={onOpenTopReview}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-left text-slate-100 hover:bg-slate-700"
          >
            <p className="font-semibold">Open top review item</p>
            <p className="text-slate-300">Resolve uncertainty immediately before moving to the next stage.</p>
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-300">
          <p>
            Voice captures: {voiceCaptureCount} • Last capture: {formatClock(lastVoiceCaptureAt)}
          </p>
          <p className="mt-1">
            Selected importer: {selectedEmailSubject} • Queue size {reviewQueueLength}
          </p>
          <p className="mt-1">Undo stack: {undoStackLength} changes ready.</p>
          {undoAuditTrail.length > 0 ? (
            <ul className="mt-1 space-y-1 text-[11px] text-slate-400">
              {undoAuditTrail.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  Undid: {entry.action} • {formatClock(entry.undoneAt)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </article>
    </section>
  );
}
