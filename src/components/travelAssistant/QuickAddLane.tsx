"use client";

type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";

interface QuickAddLaneProps {
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
}

export function QuickAddLane({
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
}: QuickAddLaneProps) {
  return (
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
          data-testid="quick-add-input-desktop"
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
          data-testid="quick-add-manual-button-desktop"
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
          data-testid="quick-add-input-mobile"
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
          data-testid="quick-add-manual-button-mobile"
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
  );
}
