"use client";

interface RescanImportsCardProps {
  rescannableCount: number;
  totalReservations: number;
  busy: boolean;
  lastSummary: string | null;
  onRescan: () => void;
}

export function RescanImportsCard({
  rescannableCount,
  totalReservations,
  busy,
  lastSummary,
  onRescan,
}: RescanImportsCardProps) {
  const disabled = busy || rescannableCount === 0 || totalReservations === 0;

  return (
    <article className="rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xl" aria-hidden>
          🔁
        </span>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">Re-scan imports</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Fill in missing flight times, gates, prices, and hotel details from saved confirmation emails
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {rescannableCount > 0
            ? `${rescannableCount} booking${rescannableCount === 1 ? "" : "s"} on this trip still have saved email text to re-check.`
            : totalReservations === 0
              ? "Add bookings to this trip first, then re-scan if anything looks incomplete."
              : "No saved email source found for current bookings. Forward confirmations to Kepi or import via Gmail to enable re-scan."}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Only fills blank fields — it won&apos;t overwrite details you&apos;ve already edited. Flights missing PDF pricing will re-fetch attachments from saved emails when possible.
        </p>

        {lastSummary ? (
          <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
            {lastSummary}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRescan}
          disabled={disabled}
          className="w-full min-h-[44px] rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
        >
          {busy ? "Re-scanning..." : "Re-scan saved confirmations"}
        </button>
      </div>
    </article>
  );
}
