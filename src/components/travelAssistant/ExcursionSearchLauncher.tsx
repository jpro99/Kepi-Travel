"use client";

import { useCallback, useRef, useState } from "react";
import { suggestAirports } from "@/lib/airports/lookup";
import { suggestHotelDestinations } from "@/lib/hotels/destinationAliases";
import { useStableDefaultSync } from "@/lib/ui/useStableDefaultSync";
import {
  EXCURSION_CATEGORY_LABELS,
  type ExcursionCategory,
} from "@/lib/excursions/types";

export interface ExcursionSearchDefaults {
  city?: string;
  cityIata?: string;
  date?: string;
}

interface ExcursionSearchLauncherProps {
  defaults?: ExcursionSearchDefaults;
  onSearch: (params: {
    destination: string;
    cityIata?: string;
    date: string;
    category: ExcursionCategory | "all";
    query: string;
  }) => void;
  busy?: boolean;
}

export function ExcursionSearchLauncher({
  defaults,
  onSearch,
  busy = false,
}: ExcursionSearchLauncherProps) {
  const [city, setCity] = useState(defaults?.city ?? "");
  const [cityIata, setCityIata] = useState(defaults?.cityIata ?? "");
  const [date, setDate] = useState(defaults?.date ?? "");
  const [category, setCategory] = useState<ExcursionCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ReturnType<typeof suggestAirports>>([]);
  const [cityHints, setCityHints] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useStableDefaultSync(
    {
      city: defaults?.city ?? "",
      cityIata: defaults?.cityIata ?? "",
      date: defaults?.date ?? "",
    },
    (next) => {
      setCity(next.city);
      setCityIata(next.cityIata);
      setDate(next.date);
    },
  );

  const submit = useCallback((): void => {
    if (!city.trim() || !date) return;
    onSearch({
      destination: cityIata || city.trim(),
      cityIata: cityIata || undefined,
      date,
      category,
      query: query.trim(),
    });
  }, [category, city, cityIata, date, onSearch, query]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Find experiences</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Cooking classes, food tours, wine tastings, and local adventures.
      </p>

      <div className="mt-4 space-y-3">
        <div ref={ref} className="relative">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Destination</label>
          <input
            type="text"
            value={city}
            autoComplete="off"
            placeholder="City (e.g. Rome, Tokyo, NYC)"
            onChange={(event) => {
              const next = event.target.value;
              setCity(next);
              setCityIata("");
              const matches = suggestAirports(next);
              setSuggestions(matches);
              const hints =
                matches.length === 0 && next.trim().length >= 3 ? suggestHotelDestinations(next) : [];
              setCityHints(hints);
              setOpen(matches.length > 0 || hints.length > 0);
            }}
            onFocus={() => {
              if (city.length >= 2) {
                const matches = suggestAirports(city);
                setSuggestions(matches);
                setCityHints(matches.length === 0 ? suggestHotelDestinations(city) : []);
                setOpen(true);
              }
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          />
          {open && (suggestions.length > 0 || cityHints.length > 0) ? (
            <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {suggestions.map((airport) => (
                <button
                  key={airport.iata}
                  type="button"
                  onMouseDown={() => {
                    setCity(`${airport.city} (${airport.iata})`);
                    setCityIata(airport.iata);
                    setOpen(false);
                  }}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 dark:border-slate-800"
                >
                  <span className="font-bold text-sky-600">{airport.iata}</span> {airport.city}
                </button>
              ))}
              {cityHints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onMouseDown={() => {
                    setCity(hint);
                    setCityIata("");
                    setOpen(false);
                  }}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 dark:border-slate-800"
                >
                  {hint}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ExcursionCategory | "all")}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All experiences</option>
              {(Object.keys(EXCURSION_CATEGORY_LABELS) as ExcursionCategory[]).map((key) => (
                <option key={key} value={key}>
                  {EXCURSION_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Search (optional)
          </label>
          <input
            type="text"
            value={query}
            placeholder="e.g. pasta, sushi, wine"
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          />
        </div>

        <button
          type="button"
          disabled={busy || !city.trim() || !date}
          onClick={submit}
          className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search experiences"}
        </button>
      </div>
    </div>
  );
}
