"use client";

import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";

interface ArrivalTransportOptionsCardProps {
  options: ArrivalTransportOption[];
  uberUrl?: string | null;
  hotelLabel?: string | null;
  scheduleNote?: string | null;
}

export function ArrivalTransportOptionsCard({
  options,
  uberUrl,
  hotelLabel,
  scheduleNote,
}: ArrivalTransportOptionsCardProps) {
  if (options.length === 0) return null;

  const primary = options.find((option) => option.isDefault) ?? options[0]!;
  const secondary = options.filter((option) => option.id !== primary.id);

  return (
    <section
      data-testid="arrival-transport-options"
      className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">
        First mile · {hotelLabel?.trim() ? `then ${hotelLabel.trim()}` : "city center"}
      </p>
      <p className="mt-1 text-lg font-black text-white">{primary.label}</p>
      <p className="mt-1 text-sm text-sky-100/85">{primary.detail}</p>
      {scheduleNote ? (
        <p
          data-testid="arrival-transport-schedule-note"
          className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90"
        >
          {scheduleNote}
        </p>
      ) : null}
      {primary.href ? (
        <a
          data-testid="arrival-transport-primary"
          href={primary.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full rounded-2xl bg-[#f4c95d] px-4 py-3.5 text-center text-sm font-bold text-[#0b1f3a] shadow-lg active:opacity-90"
        >
          {primary.label}
        </a>
      ) : null}
      {secondary.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {secondary.map((option) => (
            <li
              key={option.id}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5"
            >
              {option.href ? (
                <a
                  href={option.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-semibold text-sky-50 underline decoration-sky-400/40 underline-offset-2"
                >
                  {option.label}
                </a>
              ) : (
                <p className="text-sm font-semibold text-sky-50">{option.label}</p>
              )}
              <p className="mt-0.5 text-xs text-slate-400">{option.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {uberUrl ? (
        <a
          data-testid="arrival-transport-uber-backup"
          href={uberUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-xs font-semibold text-sky-200/80 underline decoration-sky-400/40 underline-offset-2"
        >
          Uber backup{hotelLabel?.trim() ? ` to ${hotelLabel.trim()}` : ""}
        </a>
      ) : null}
    </section>
  );
}
