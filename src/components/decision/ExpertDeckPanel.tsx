"use client";

import type { DateFlexDays, ExpertDeckOptions } from "@/lib/decision/expertDeck";
import type { FlightLegPlan } from "@/lib/decision/types";

interface ExpertDeckPanelProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  options: ExpertDeckOptions;
  onChange: (next: ExpertDeckOptions) => void;
  searchAirports: string[];
  candidateOrigins: string[];
  flightLegs?: FlightLegPlan[];
  pointsPrograms: string[];
  onApply: () => void;
  busy?: boolean;
}

export function ExpertDeckPanel({
  enabled,
  onToggle,
  options,
  onChange,
  searchAirports,
  candidateOrigins,
  flightLegs,
  pointsPrograms,
  onApply,
  busy,
}: ExpertDeckPanelProps) {
  const origins = candidateOrigins.length > 0 ? candidateOrigins : searchAirports;

  return (
    <div className="mt-4 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Expert mode</p>
          <p className="mt-0.5 text-xs text-slate-300">More controls — same top 3 results.</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
            enabled
              ? "bg-[#f4c95d] text-[#0b1f3a]"
              : "border border-slate-600 text-slate-300 hover:border-slate-400"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {enabled ? (
        <div className="mt-4 space-y-4 border-t border-slate-600 pt-4">
          {origins.length > 0 ? (
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Origin airport
              </span>
              <select
                value={options.originIata ?? ""}
                onChange={(event) =>
                  onChange({
                    ...options,
                    enabled: true,
                    originIata: event.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="">Auto cluster ({origins.join(", ")})</option>
                {origins.map((iata) => (
                  <option key={iata} value={iata}>
                    {iata}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              CPP floor (¢/pt)
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={5}
              value={Math.round((options.cppFloor ?? 0) * 10)}
              onChange={(event) =>
                onChange({
                  ...options,
                  enabled: true,
                  cppFloor: Number(event.target.value) / 10,
                })
              }
              className="mt-2 w-full accent-[#f4c95d]"
            />
            <p className="mt-1 text-xs text-slate-400">
              {options.cppFloor && options.cppFloor > 0
                ? `Hide plays below ${options.cppFloor.toFixed(1)}¢/pt`
                : "No CPP filter"}
            </p>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Date flex window
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {([3, 7, 14] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...options,
                      enabled: true,
                      dateFlexDays: days as DateFlexDays,
                    })
                  }
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    (options.dateFlexDays ?? 3) === days
                      ? "bg-sky-600 text-white"
                      : "border border-slate-600 text-slate-300"
                  }`}
                >
                  ±{days}d
                </button>
              ))}
            </div>
          </label>

          {pointsPrograms.length > 0 ? (
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Points program
              </span>
              <select
                value={options.pointsProgram ?? ""}
                onChange={(event) =>
                  onChange({
                    ...options,
                    enabled: true,
                    pointsProgram: event.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="">All programs</option>
                {pointsPrograms.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {flightLegs && flightLegs.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Leg departure dates
              </p>
              <div className="mt-2 space-y-2">
                {flightLegs.map((leg) => (
                  <label key={leg.id} className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="min-w-0 flex-1 truncate">
                      {leg.fromLabel} → {leg.toLabel}
                    </span>
                    <input
                      type="date"
                      value={options.legDateOverrides?.[leg.id] ?? leg.departureDate}
                      onChange={(event) =>
                        onChange({
                          ...options,
                          enabled: true,
                          legDateOverrides: {
                            ...options.legDateOverrides,
                            [leg.id]: event.target.value,
                          },
                        })
                      }
                      className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onApply}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {busy ? "Applying…" : "Apply expert settings"}
            </button>
            <a
              href="/travel-assistant?advanced=1"
              className="text-xs font-semibold text-sky-300 hover:text-sky-100"
            >
              Open advanced workspace →
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
