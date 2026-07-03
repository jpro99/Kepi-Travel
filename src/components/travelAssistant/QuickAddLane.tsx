"use client";

import { useTranslations } from "next-intl";

type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";

interface QuickAddLaneProps {
  readOnly?: boolean;
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
  readOnly = false,
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
  const t = useTranslations("QuickAddLane");

  return (
    <section className="sticky top-2 z-20 -mx-1 rounded-2xl border border-slate-200 bg-white/90 p-2 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90 md:static md:mx-0">
      {readOnly ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          View-only trip — quick add and edits are disabled.
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={onEvaluateStatus}
          className="shrink-0 rounded-full bg-cyan-500/90 px-3 py-1.5 font-semibold text-slate-900 hover:bg-cyan-400"
        >
          {t("autoEvaluate")}
        </button>
        <button
          type="button"
          onClick={onRunSmartEscalation}
          disabled={readOnly}
          className="shrink-0 rounded-full bg-indigo-500/90 px-3 py-1.5 font-semibold text-slate-100 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("smartEscalation")}
        </button>
        <button
          type="button"
          onClick={onTriggerReminderDispatch}
          disabled={readOnly}
          className="shrink-0 rounded-full bg-amber-500/90 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("dispatchReminders")}
        </button>
        <button
          type="button"
          onClick={onFlushPendingSync}
          aria-label={t("syncNow")}
          className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 font-semibold ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
        >
          {t("syncNow")}
        </button>
        <button
          type="button"
          onClick={onTogglePersonalTimelineOnly}
          className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 font-semibold ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
        >
          {personalTimelineOnly ? t("showGroupTimeline") : t("showMyTimeline")}
        </button>
        <button
          type="button"
          onClick={onAdvanceTripStage}
          disabled={readOnly}
          className="shrink-0 rounded-full bg-emerald-500/80 px-3 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("advanceStage")}
        </button>
        <button
          type="button"
          onClick={onUndoLastCriticalChange}
          disabled={readOnly}
          aria-label={t("undoCriticalChange")}
          className="shrink-0 rounded-full bg-rose-500/85 px-3 py-1.5 font-semibold text-slate-950 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("undoCriticalChange")}
        </button>
        <button
          type="button"
          onClick={onToggleStageFocusMode}
          className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 font-semibold ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
        >
          {stageFocusMode ? t("showAllPanels") : t("focusMode")}
        </button>
      </div>
      <div className="mt-2 hidden gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-2 dark:border-slate-700 dark:bg-slate-950/60 md:grid md:grid-cols-[1.4fr_auto_auto_auto]">
        <label htmlFor="quick-add-input-desktop" className="sr-only">
          {t("quickAddTextLabel")}
        </label>
        <input
          id="quick-add-input-desktop"
          data-testid="quick-add-input-desktop"
          type="text"
          value={quickAddText}
          disabled={readOnly}
          onChange={(event) => onQuickAddTextChange(event.target.value)}
          placeholder={t("desktopPlaceholder")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <label htmlFor="quick-add-type-desktop" className="sr-only">
          {t("quickAddTypeLabel")}
        </label>
        <select
          id="quick-add-type-desktop"
          value={quickAddType}
          disabled={readOnly}
          onChange={(event) => onQuickAddTypeChange(event.target.value as ReservationType)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
        >
          {(Object.keys(reservationTypeLabelByType) as ReservationType[]).map((type) => (
            <option key={type} value={type}>
              {reservationTypeLabelByType[type]}
            </option>
          ))}
        </select>
        <label htmlFor="quick-add-confidence-desktop" className="sr-only">
          {t("quickAddConfidenceLabel")}
        </label>
        <select
          id="quick-add-confidence-desktop"
          value={quickAddConfidence}
          disabled={readOnly}
          onChange={(event) => onQuickAddConfidenceChange(event.target.value as Confidence)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="high">{t("highConfidence")}</option>
          <option value="medium">{t("mediumConfidence")}</option>
          <option value="low">{t("lowConfidence")}</option>
        </select>
        <button
          type="button"
          onClick={onVoiceQuickCapture}
          disabled={readOnly}
          className="rounded-lg bg-violet-500/85 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("voice")}
        </button>
        <button
          type="button"
          onClick={() => onQuickAdd("email-paste")}
          disabled={readOnly}
          className="rounded-lg bg-cyan-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("addAsEmail")}
        </button>
        <button
          data-testid="quick-add-manual-button-desktop"
          type="button"
          onClick={() => onQuickAdd("manual")}
          disabled={readOnly}
          className="rounded-lg bg-emerald-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("addManual")}
        </button>
        <p className="self-center text-[11px] text-slate-600 dark:text-slate-400 md:col-span-2">
          {t("autoRoutedNote")}
        </p>
        <p className="self-center text-[11px] text-slate-600 dark:text-slate-400">{t("undoReady", { count: undoStackLength })}</p>
      </div>
      <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-100/70 p-2 dark:border-slate-700 dark:bg-slate-950/60 md:hidden">
        <label htmlFor="quick-add-input-mobile" className="sr-only">
          {t("quickAddTextLabel")}
        </label>
        <input
          id="quick-add-input-mobile"
          data-testid="quick-add-input-mobile"
          type="text"
          value={quickAddText}
          disabled={readOnly}
          onChange={(event) => onQuickAddTextChange(event.target.value)}
          placeholder={t("mobilePlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onVoiceQuickCapture}
            disabled={readOnly}
            className="rounded-lg bg-violet-500/85 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("voice")}
          </button>
          <button
          data-testid="quick-add-manual-button-mobile"
            type="button"
            onClick={() => onQuickAdd("manual")}
            disabled={readOnly}
            className="rounded-lg bg-emerald-500/85 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("addNow")}
          </button>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">{t("simpleModeNote")}</p>
      </div>
    </section>
  );
}
