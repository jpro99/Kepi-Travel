"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import { suggestHotelCityDestinations } from "@/lib/hotels/resolveDestination";
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

function refreshSuggestions(query: string): {
  airports: AirportResult[];
  cities: ReturnType<typeof suggestHotelCityDestinations>;
} {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { airports: [], cities: [] };
  }
  const airports = suggestAirports(trimmed);
  const cities = suggestHotelCityDestinations(trimmed);
  const airportLabels = new Set(
    airports.map((airport) => airport.city.toLowerCase().split(",")[0]?.trim() ?? ""),
  );
  const dedupedCities = cities.filter((city) => {
    const stem = city.label.toLowerCase().split(",")[0]?.trim() ?? city.label.toLowerCase();
    return !airportLabels.has(stem);
  });
  return { airports, cities: dedupedCities };
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
  const [airports, setAirports] = useState<AirportResult[]>([]);
  const [cities, setCities] = useState<ReturnType<typeof suggestHotelCityDestinations>>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const touchRef = useRef({ startY: 0, moved: false });

  const applySuggestions = useCallback((query: string): void => {
    const next = refreshSuggestions(query);
    setAirports(next.airports);
    setCities(next.cities);
    setOpen(next.airports.length > 0 || next.cities.length > 0);
  }, []);

  useEffect(() => {
    const handlePointer = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  const guardScrollTap = (handler: () => void) => (): void => {
    if (touchRef.current.moved) {
      touchRef.current.moved = false;
      return;
    }
    handler();
  };

  const inputClass = compact
    ? "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
    : SEARCH_INPUT_LIGHT;

  const labelClass = compact
    ? "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    : SEARCH_LABEL;

  const hasSuggestions = airports.length > 0 || cities.length > 0;

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
            applySuggestions(next);
          }}
          onFocus={() => {
            if (value.trim().length >= 2) applySuggestions(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") setOpen(false);
          }}
          className={`${inputClass} pr-10 text-base`}
        />
        {value.trim() ? (
          <button
            type="button"
            aria-label="Clear destination"
            data-testid="hotel-city-clear"
            onClick={() => {
              onClear?.();
              onChange("", "");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        ) : null}
      </div>
      {cityIata ? (
        <p className="mt-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">{cityIata}</p>
      ) : null}
      {open && hasSuggestions ? (
        <div
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          onTouchStart={(event) => {
            touchRef.current = { startY: event.touches[0]?.clientY ?? 0, moved: false };
          }}
          onTouchMove={(event) => {
            const currentY = event.touches[0]?.clientY ?? touchRef.current.startY;
            if (Math.abs(currentY - touchRef.current.startY) > 10) {
              touchRef.current.moved = true;
            }
          }}
        >
          {cities.length > 0 ? (
            <p className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Cities
            </p>
          ) : null}
          {cities.map((city) => (
            <button
              key={city.label}
              type="button"
              onClick={guardScrollTap(() => {
                onChange(city.label, "");
                setOpen(false);
              })}
              className="flex w-full touch-manipulation items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-emerald-600 dark:text-emerald-400">
                City
              </span>
              <span className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{city.label}</p>
                {city.iata ? (
                  <p className="text-xs text-slate-500">Near {city.iata} airport</p>
                ) : null}
              </span>
            </button>
          ))}
          {airports.length > 0 ? (
            <p className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Airports
            </p>
          ) : null}
          {airports.map((airport) => (
            <button
              key={airport.iata}
              type="button"
              onClick={guardScrollTap(() => {
                onChange(`${airport.city} (${airport.iata})`, airport.iata);
                setOpen(false);
              })}
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
        </div>
      ) : null}
      {value.trim().length >= 3 && !open ? (
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          Type a city like Lecce, Italy — tap Search when ready.
        </p>
      ) : null}
    </div>
  );
}
