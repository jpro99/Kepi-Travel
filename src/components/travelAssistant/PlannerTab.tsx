"use client";

interface PlannerTabProps {
  tripName: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  flightCount: number;
  hotelCount: number;
  otherBookingCount: number;
  readyStepCount: number;
  forwardAddress: string;
  canUseGmailImport: boolean;
  gmailImportBusy: boolean;
  onAddBooking: () => void;
  onCreateTrip: () => void;
  onImportGmail: () => void;
  onRequestGmailUpgrade: () => void;
  onCopyForwardAddress: () => void;
  onViewTrip: () => void;
  onViewFlights: () => void;
  onViewHotels: () => void;
}

export function PlannerTab({
  tripName,
  destination,
  startDate,
  endDate,
  flightCount,
  hotelCount,
  otherBookingCount,
  readyStepCount,
  forwardAddress,
  canUseGmailImport,
  gmailImportBusy,
  onAddBooking,
  onCreateTrip,
  onImportGmail,
  onRequestGmailUpgrade,
  onCopyForwardAddress,
  onViewTrip,
  onViewFlights,
  onViewHotels,
}: PlannerTabProps) {
  const planningSteps = [
    {
      done: Boolean(tripName),
      title: "Create trip shell",
      detail: tripName ?? "Start a trip before adding bookings.",
      action: "New trip",
      onClick: onCreateTrip,
    },
    {
      done: Boolean(startDate && endDate),
      title: "Set dates",
      detail: startDate && endDate ? `${startDate} to ${endDate}` : "Dates fill from first flight or hotel.",
      action: "Review",
      onClick: onViewTrip,
    },
    {
      done: flightCount > 0,
      title: "Add flights",
      detail: flightCount > 0 ? `${flightCount} flight${flightCount === 1 ? "" : "s"} added.` : "Add or import flight confirmations.",
      action: flightCount > 0 ? "Flights" : "Add",
      onClick: flightCount > 0 ? onViewFlights : onAddBooking,
    },
    {
      done: hotelCount > 0,
      title: "Add stays",
      detail: hotelCount > 0 ? `${hotelCount} hotel${hotelCount === 1 ? "" : "s"} added.` : "Add hotel or stay confirmations.",
      action: hotelCount > 0 ? "Hotels" : "Add",
      onClick: hotelCount > 0 ? onViewHotels : onAddBooking,
    },
  ];

  return (
    <section className="space-y-4">
      <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-sky-900 p-5 text-white shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Plan</p>
        <h1 className="mt-1 text-2xl font-black leading-tight">Build your next trip</h1>
        <p className="mt-2 text-sm leading-relaxed text-sky-100/80">
          Add flights, hotels, rides, and key plans. Kepi turns them into one live timeline.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onAddBooking}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-50"
          >
            + Add booking
          </button>
          <button
            type="button"
            onClick={onCreateTrip}
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            New trip
          </button>
        </div>
      </article>

      <section className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onAddBooking}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <span className="text-xl">📌</span>
          <p className="mt-2 font-semibold text-slate-900 dark:text-white">Manual add</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Flight, hotel, train, ride, dinner.</p>
        </button>
        <button
          type="button"
          disabled={gmailImportBusy}
          onClick={canUseGmailImport ? onImportGmail : onRequestGmailUpgrade}
          className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left shadow-sm transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/40 dark:bg-sky-950/40 dark:hover:bg-sky-900/50"
        >
          <span className="text-xl">✉️</span>
          <p className="mt-2 font-semibold text-sky-950 dark:text-sky-100">
            {gmailImportBusy ? "Scanning Gmail" : "Import Gmail"}
          </p>
          <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-100/70">Pull bookings into the plan.</p>
        </button>
        <button
          type="button"
          onClick={onCopyForwardAddress}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40"
        >
          <span className="text-xl">↗</span>
          <p className="mt-2 font-semibold text-emerald-950 dark:text-emerald-100">Forward email</p>
          <p className="mt-1 break-all text-xs text-emerald-800/80 dark:text-emerald-100/70">{forwardAddress}</p>
        </button>
      </section>

      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Current plan</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{tripName ?? "No trip selected"}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {destination ?? "Destination pending"} · {startDate ?? "Start pending"}
              {endDate ? ` → ${endDate}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-100">
            {readyStepCount}/4 ready
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
            <p className="text-2xl font-black text-slate-950 dark:text-white">{flightCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Flights</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
            <p className="text-2xl font-black text-slate-950 dark:text-white">{hotelCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hotels</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
            <p className="text-2xl font-black text-slate-950 dark:text-white">{Math.max(0, otherBookingCount)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Other plans</p>
          </div>
        </div>
      </article>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950 dark:text-white">Planning steps</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Do these first. Timeline cleans up after.</p>
          </div>
          <button
            type="button"
            onClick={onViewTrip}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View trip
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {planningSteps.map((step) => (
            <div
              key={step.title}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/50"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-white text-slate-400 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
                }`}
              >
                {step.done ? "✓" : "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{step.title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{step.detail}</span>
              </span>
              <button
                type="button"
                onClick={step.onClick}
                className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {step.action}
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
