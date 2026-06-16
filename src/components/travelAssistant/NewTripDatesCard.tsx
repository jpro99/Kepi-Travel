"use client";

interface NewTripDatesCardProps {
  hotelName: string;
  suggestedCheckIn: string;
  suggestedCheckOut: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSave: () => void;
  onDismiss?: () => void;
}

export function NewTripDatesCard({
  hotelName,
  suggestedCheckIn,
  suggestedCheckOut,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSave,
  onDismiss,
}: NewTripDatesCardProps) {
  return (
    <article className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm dark:border-sky-500/40 dark:from-sky-950/40 dark:to-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-300">New trip noticed</p>
      <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{hotelName}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        We found a hotel booking. Set the travel dates for this trip so the timeline only shows what matters
        {suggestedCheckIn ? ` (check-in ${suggestedCheckIn}` : ""}
        {suggestedCheckOut && suggestedCheckOut !== suggestedCheckIn ? ` → ${suggestedCheckOut})` : suggestedCheckIn ? ")" : "."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Trip start
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Trip end
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500"
        >
          Save trip dates
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Not now
          </button>
        ) : null}
      </div>
    </article>
  );
}
