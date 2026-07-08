"use client";

import type { InterCityRouteSuggestion, TransportModeEstimate } from "@/lib/travelAssistant/interCityTransportSuggestions";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";

interface TransportRouteSheetProps {
  open: boolean;
  route: InterCityRouteSuggestion | null;
  onClose: () => void;
  onPickMode: (mode: QuickGroundMode) => void;
}

function modeToQuickGround(mode: TransportModeEstimate["mode"]): QuickGroundMode {
  if (mode === "train") return "train";
  if (mode === "taxi") return "taxi";
  return "uber";
}

export function TransportRouteSheet({ open, route, onClose, onPickMode }: TransportRouteSheetProps) {
  if (!open || !route) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">
            We&apos;ll help you plan it
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
            {route.fromLabel} → {route.toLabel}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            ~{route.distanceMi} mi ({route.distanceKm} km) · estimates only — you pick what fits
          </p>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{route.hint}</p>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto px-5 py-4">
          {route.modes.map((mode) => (
            <button
              key={mode.mode}
              type="button"
              onClick={() => onPickMode(modeToQuickGround(mode.mode))}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition active:opacity-80 ${
                mode.recommended
                  ? "border-sky-300 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/40"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {mode.emoji} {mode.label}
                  {mode.recommended ? (
                    <span className="ml-2 text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300">
                      Common pick
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{mode.summary}</p>
              </div>
              <span className="text-xs font-bold text-sky-700 dark:text-sky-300">Add →</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <a
            href={route.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            Open route in Google Maps
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-[#0F1923] px-4 py-3 text-sm font-bold text-white dark:bg-[#f4c95d] dark:text-[#0F1923]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
