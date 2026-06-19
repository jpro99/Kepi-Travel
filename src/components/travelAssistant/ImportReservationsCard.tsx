"use client";

interface ImportReservationsCardProps {
  forwardAddress: string;
  placeholderCount: number;
  highlighted?: boolean;
  /** Plan saved from Command Deck vs generic trip activation */
  mode?: "default" | "plan-saved";
  confirmedCount?: number;
  totalBookableCount?: number;
  canUseGmailImport: boolean;
  gmailImportBusy?: boolean;
  onCopyForward: () => void;
  onImportGmail: () => void;
  onConnectGmail?: () => void;
  onAddManual: () => void;
  onContinueBooking?: () => void;
  onRequestUpgrade?: () => void;
  onDismiss?: () => void;
}

export function ImportReservationsCard({
  forwardAddress,
  placeholderCount,
  highlighted = false,
  mode = "default",
  confirmedCount = 0,
  totalBookableCount = 0,
  canUseGmailImport,
  gmailImportBusy = false,
  onCopyForward,
  onImportGmail,
  onConnectGmail,
  onAddManual,
  onContinueBooking,
  onRequestUpgrade,
  onDismiss,
}: ImportReservationsCardProps) {
  if (placeholderCount <= 0 && !highlighted) return null;

  const planSaved = mode === "plan-saved";
  const shell = highlighted
    ? planSaved
      ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/40 dark:from-amber-950/40 dark:to-slate-900"
      : "border-sky-300 bg-gradient-to-br from-sky-50 to-white dark:border-sky-500/40 dark:from-sky-950/40 dark:to-slate-900"
    : "border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10";

  const eyebrow = planSaved && highlighted ? "Plan saved" : highlighted ? "Trip activated" : "Next step";
  const title = planSaved ? "Book your legs, then confirm here" : "Add your real confirmations";

  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          {totalBookableCount > 0 ? (
            <p className="mt-2 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-slate-900/70 dark:text-amber-200">
              {confirmedCount}/{totalBookableCount} flights & hotels confirmed
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {placeholderCount > 0
              ? planSaved
                ? `${placeholderCount} leg${placeholderCount === 1 ? "" : "s"} still marked PLANNED. Purchase on the airline, then forward confirmations — Kepi replaces planned legs with real times and record locators.`
                : `${placeholderCount} reservation${placeholderCount === 1 ? "" : "s"} ${placeholderCount === 1 ? "is" : "are"} still placeholders from planning. Forward booking emails or import from Gmail to replace them with live details.`
              : planSaved
                ? "Forward any flight or hotel confirmation after you book — Kepi upgrades your timeline from planned to live."
                : "Forward any flight or hotel confirmation so Kepi can track gates, times, and check-in for you."}
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        ) : null}
      </div>

      {onContinueBooking && placeholderCount > 0 ? (
        <button
          type="button"
          onClick={onContinueBooking}
          className="mt-4 w-full rounded-xl bg-[#0b1f3a] py-3 text-sm font-black text-[#f4c95d] hover:bg-[#152238] dark:bg-[#f4c95d] dark:text-[#0b1f3a] dark:hover:bg-[#ffe29a]"
        >
          Continue booking walkthrough →
        </button>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/50">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Your Kepi forward address</p>
        <p className="mt-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{forwardAddress}</p>
        <button
          type="button"
          onClick={onCopyForward}
          className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          Copy forward address
        </button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Forward from Gmail, Outlook, or your phone — confirmations replace planned legs automatically.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={gmailImportBusy}
          onClick={() => {
            if (!canUseGmailImport) {
              onRequestUpgrade?.();
              return;
            }
            onImportGmail();
          }}
          className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {gmailImportBusy ? "Scanning inbox…" : canUseGmailImport ? "Import from Gmail" : "Upgrade to import Gmail"}
        </button>
        {onConnectGmail ? (
          <button
            type="button"
            onClick={onConnectGmail}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Connect Gmail
          </button>
        ) : null}
        <button
          type="button"
          onClick={onAddManual}
          className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Add manually
        </button>
      </div>
    </section>
  );
}
