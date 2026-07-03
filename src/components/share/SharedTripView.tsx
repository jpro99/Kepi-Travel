import Link from "next/link";
import type { TripShareOptions } from "@/lib/travelAssistant/tripShareStore";

interface SharedReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  notes?: string;
}

interface SharedTripViewProps {
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  reservations: SharedReservation[];
  options: TripShareOptions;
  expiresAt: string;
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  dinner: "🍽",
  train: "🚆",
  ride: "🚗",
};

function formatDate(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (Number.isNaN(ms)) return localTime;
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function SharedTripView({
  tripName,
  destination,
  startDate,
  endDate,
  reservations,
  options,
  expiresAt,
}: SharedTripViewProps) {
  const sorted = [...reservations].sort(
    (a, b) => Date.parse(a.localTime.replace(" ", "T")) - Date.parse(b.localTime.replace(" ", "T")),
  );

  return (
    <div className="min-h-dvh bg-[#0d1117] px-4 py-6 text-[#e6edf3]">
      <div className="mx-auto max-w-md">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-sm font-black text-[#0d1117]">
              K
            </div>
            <span className="text-sm text-slate-400">Shared via Kepi Travel</span>
          </div>
          <h1 className="mt-2 text-3xl font-black">{tripName}</h1>
          {destination ? <p className="mt-1 text-base text-slate-400">📍 {destination}</p> : null}
          <p className="mt-2 text-xs text-slate-500">
            {startDate} → {endDate}
            {options.readOnly ? " · Read-only" : ""}
          </p>
          <p className="mt-1 text-xs text-slate-600">Link expires {new Date(expiresAt).toLocaleDateString()}</p>
        </header>

        <div className="flex flex-col gap-3">
          {sorted.map((reservation) => (
            <article
              key={reservation.id}
              className={`rounded-2xl border p-4 ${
                reservation.type === "flight"
                  ? "border-violet-500/30 bg-gradient-to-br from-[#1a1030] to-[#0d1117]"
                  : "border-slate-700 bg-[#161b22]"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    reservation.type === "flight" ? "bg-violet-500/20 text-violet-300" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {TYPE_EMOJI[reservation.type] ?? "📌"} {reservation.type}
                </span>
                <span className="text-sm text-slate-400">{formatDate(reservation.localTime)}</span>
              </div>
              <p className="text-lg font-bold">{reservation.title || reservation.provider}</p>
              {reservation.provider && reservation.title ? (
                <p className="text-sm text-slate-400">{reservation.provider}</p>
              ) : null}
              {reservation.localTime ? (
                <p className="mt-1 text-sm text-slate-300">{formatTime(reservation.localTime)}</p>
              ) : null}
              {reservation.location ? <p className="mt-1 text-xs text-slate-500">📍 {reservation.location}</p> : null}
              {reservation.notes ? <p className="mt-2 text-xs text-slate-400">{reservation.notes}</p> : null}
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-600">
          Shared read-only via{" "}
          <Link href="https://kepitravel.com" className="text-sky-400 hover:underline">
            kepitravel.com
          </Link>
        </p>
      </div>
    </div>
  );
}
