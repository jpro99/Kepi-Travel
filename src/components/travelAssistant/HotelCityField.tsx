"use client";

import { useEffect, useRef, useState } from "react";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import { suggestHotelDestinations } from "@/lib/hotels/destinationAliases";
import { SEARCH_INPUT_LIGHT, SEARCH_LABEL } from "@/lib/ui/searchResponsive";

interface HotelCityFieldProps {
  label: string;
  value: string;
  cityIata?: string;
  onChange: (display: string, iata: string) => void;
  onClear?: () => void;
  placeholder: string;
  /** Use compact styling (Book tab launcher). */
  compact?: boolean;
}

function pickSuggestion(event: React.PointerEvent, handler: () => void): void {
  event.preventDefault();
  handler();
}

export function HotelCityField({
  label,
  value,
  cityIata = "",
  onChange,
  onClear,
  placeholder,
  compact = false,
}: HotelCityFieldProps) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
  const [cityHints, setCityHints] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointer = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  const inputClass = compact
    ? "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
    : SEARCH_INPUT_LIGHT;

  const labelClass = compact
    ? "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    : SEARCH_LABEL;

  return (
    <div ref={ref} className="relative min-w-0" data-hotel-city-field>
      <label className={labelClass}>{label}</label>
      <div className="relative mt-1">
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next, "");
            const matches = suggestAirports(next);
            setSuggestions(matches);
            const hints =
              matches.length === 0 && next.trim().length >= 2 ? suggestHotelDestinations(next) : [];
            setCityHints(hints);
            setOpen(matches.length > 0 || hints.length > 0);
          }}
          onFocus={() => {
            if (value.length >= 2) {
              const matches = suggestAirports(value);
              setSuggestions(matches);
              const hints = matches.length === 0 ? suggestHotelDestinations(value) : [];
              setCityHints(hints);
              setOpen(matches.length > 0 || hints.length > 0);
            }
          }}
          className={`${inputClass} pr-10 text-base`}
        />
        {value.trim() ? (
          <button
            type="button"
            aria-label="Clear destination"
            data-testid="hotel-city-clear"
            onPointerDown={(event) => pickSuggestion(event, () => {
              onClear?.();
              onChange("", "");
              setOpen(false);
            })}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        ) : null}
      </div>
      {cityIata ? (
        <p className="mt-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">{cityIata}</p>
      ) : null}
      {open && (suggestions.length > 0 || cityHints.length > 0) ? (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((airport) => (
            <button
              key={airport.iata}
              type="button"
              onPointerDown={(event) =>
                pickSuggestion(event, () => {
                  onChange(`${airport.city} (${airport.iata})`, airport.iata);
                  setOpen(false);
                })
              }
              className="flex w-full touch-manipulation items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-slate-600 dark:text-sky-300">
                {airport.iata}
              </span>
              <span className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{airport.city}</p>
                <p className="truncate text-xs text-slate-500">{airport.name}</p>
              </span>
            </button>
          ))}
          {cityHints.map((hint) => (
            <button
              key={hint}
              type="button"
              onPointerDown={(event) =>
                pickSuggestion(event, () => {
                  onChange(hint, "");
                  setOpen(false);
                })
              }
              className="flex w-full touch-manipulation items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-slate-500">City</span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{hint}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
