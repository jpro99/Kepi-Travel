"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CityListEntry = {
  id: string;
  label: string;
  region: string;
};

const MAX_RESULTS = 120;

const CITY_SEARCH_INPUT_ID = "kepi-city-search-input";
const CITY_SEARCH_LABEL_ID = "kepi-city-search-label";

export function CitySearchCombobox({
  cities,
  valueId,
  onSelect,
}: {
  cities: CityListEntry[];
  valueId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => cities.find((c) => c.id === valueId),
    [cities, valueId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return cities.slice(0, MAX_RESULTS);
    }
    return cities
      .filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.region.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [cities, query]);

  const cancelBlur = useCallback(() => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelBlur();
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setIsEditing(false);
    }, 180);
  }, [cancelBlur]);

  useEffect(() => {
    return () => cancelBlur();
  }, [cancelBlur]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 flex-1 sm:max-w-[min(22rem,100%)]"
    >
      <label
        id={CITY_SEARCH_LABEL_ID}
        htmlFor={CITY_SEARCH_INPUT_ID}
        className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
      >
        City search
      </label>
      <input
        id={CITY_SEARCH_INPUT_ID}
        name="citySearch"
        type="text"
        role="combobox"
        aria-labelledby={CITY_SEARCH_LABEL_ID}
        aria-expanded={open}
        aria-controls="city-search-results"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={selected?.label ?? "Search cities…"}
        value={isEditing ? query : selected?.label ?? ""}
        onFocus={() => {
          cancelBlur();
          setOpen(true);
          setIsEditing(true);
          setQuery(selected?.label ?? "");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={scheduleClose}
        className="mt-0.5 w-full rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
      />
      {open && (
        <ul
          id="city-search-results"
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-xl ring-1 ring-black/40"
          onMouseDown={cancelBlur}
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">No matches</li>
          )}
          {filtered.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === valueId}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                  setIsEditing(false);
                  setQuery("");
                }}
              >
                <span className="font-medium text-slate-100">{c.label}</span>
                <span className="text-[10px] text-slate-500">{c.region}</span>
              </button>
            </li>
          ))}
          {filtered.length >= MAX_RESULTS && (
            <li className="border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-500">
              Showing first {MAX_RESULTS} matches — type to narrow.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
