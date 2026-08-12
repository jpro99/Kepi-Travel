"use client";

interface ShareTripCardProps {
  tripId: string | null;
  tripName: string;
  /** When true, this trip was shared by a partner for editing. */
  isSharedWithMe?: boolean;
  onOpenShare?: () => void;
}

export function ShareTripCard({
  tripId,
  tripName,
  isSharedWithMe = false,
  onOpenShare,
}: ShareTripCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xl">
          {isSharedWithMe ? "🤝" : "🔗"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isSharedWithMe ? "Shared trip" : "Share with your partner"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isSharedWithMe
              ? "You're on this trip together. Changes show up for both of you."
              : "Send a link. They open it on iPhone or the web — same itinerary, no extra app hunt."}
          </p>
          {isSharedWithMe ? (
            <p className="mt-2 inline-flex rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              Editing together
            </p>
          ) : null}
          {!tripId ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Open or create a trip first.</p>
          ) : null}
          <button
            type="button"
            disabled={!tripId || !onOpenShare}
            onClick={() => onOpenShare?.()}
            className="mt-3 min-h-[48px] w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {isSharedWithMe
              ? `Share "${tripName}" again`
              : `Share "${tripName}"`}
          </button>
        </div>
      </div>
    </div>
  );
}
