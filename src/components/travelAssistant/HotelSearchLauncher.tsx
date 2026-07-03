"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import { suggestHotelDestinations } from "@/lib/hotels/destinationAliases";
import { useStableDefaultSync } from "@/lib/ui/useStableDefaultSync";

export interface HotelSearchDefaults {
  city?: string;
  cityIata?: string;
  checkIn?: string;
  checkOut?: string;
}

interface HotelSearchLauncherProps {
  tripName?: string | null;
  defaults?: HotelSearchDefaults;
  onSearch: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
}

function CityField({
  label,
  value,
  cityIata,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  cityIata: string;
  onChange: (display: string, iata: string) => void;
  placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
  const [cityHints, setCityHints] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          onChange(next, "");
          const matches = suggestAirports(next);
          setSuggestions(matches);
          const hints = matches.length === 0 && next.trim().length >= 3 ? suggestHotelDestinations(next) : [];
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
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
      />
      {cityIata ? <p className="mt-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">{cityIata}</p> : null}
      {open && (suggestions.length > 0 || cityHints.length > 0) ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((airport) => (
            <button
              key={airport.iata}
              type="button"
              onMouseDown={() => {
                onChange(`${airport.city} (${airport.iata})`, airport.iata);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 dark:border-slate-800"
            >
              <span className="w-9 shrink-0 text-xs font-black text-sky-600">{airport.iata}</span>
              <span className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{airport.city}</p>
                <p className="truncate text-[10px] text-slate-500">{airport.name}</p>
              </span>
            </button>
          ))}
          {cityHints.map((hint) => (
            <button
              key={hint}
              type="button"
              onMouseDown={() => {
                onChange(hint, "");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 dark:border-slate-800"
            >
              <span className="w-9 shrink-0 text-xs font-black text-slate-500">City</span>
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{hint}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HotelSearchLauncher({ tripName, defaults, onSearch }: HotelSearchLauncherProps) {
  const [city, setCity] = useState("");
  const [cityIata, setCityIata] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const userEditedRef = useRef(false);

  const defaultCity = defaults?.city ?? "";
  const defaultCityIata = defaults?.cityIata ?? "";
  const defaultCheckIn = defaults?.checkIn?.slice(0, 10) ?? "";
  const defaultCheckOut = defaults?.checkOut?.slice(0, 10) ?? "";
  const cityDefaultsKey = `${defaultCity}|${defaultCityIata}`;
  const dateDefaultsKey = `${defaultCheckIn}|${defaultCheckOut}`;

  const applyCityDefaults = useCallback(() => {
    if (userEditedRef.current) return;
    if (defaultCity) setCity(defaultCity);
    if (defaultCityIata) setCityIata(defaultCityIata);
  }, [defaultCity, defaultCityIata]);

  const applyDateDefaults = useCallback(() => {
    if (userEditedRef.current) return;
    if (defaultCheckIn) setCheckIn(defaultCheckIn);
    if (defaultCheckOut) setCheckOut(defaultCheckOut);
  }, [defaultCheckIn, defaultCheckOut]);

  useStableDefaultSync(cityDefaultsKey, applyCityDefaults);
  useStableDefaultSync(dateDefaultsKey, applyDateDefaults);

  const launchSearch = (): void => {
    setMessage(null);
    if (!city.trim()) {
      setMessage("Enter a destination city.");
      return;
    }
    if (!checkIn.trim() || !checkOut.trim()) {
      setMessage("Choose check-in and check-out dates.");
      return;
    }
    if (Date.parse(checkOut) <= Date.parse(checkIn)) {
      setMessage("Check-out must be after check-in.");
      return;
    }
    onSearch({
      city: city.trim(),
      cityIata: cityIata.trim() || undefined,
      checkIn: checkIn.slice(0, 10),
      checkOut: checkOut.slice(0, 10),
    });
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/30 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            Book travel
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Search & book hotels</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {tripName ? `${tripName} · ` : ""}
            Live rates from Kepi — book and pay in-app.
          </p>
        </div>
        <Link
          href="/book?tab=hotels"
          className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Full checkout →
        </Link>
      </div>

      <div className="mt-4">
        <CityField
          label="Destination"
          value={city}
          cityIata={cityIata}
          onChange={(display, iata) => {
            userEditedRef.current = true;
            setCity(display);
            setCityIata(iata);
          }}
          placeholder="Lecce, Italy · Venice (VCE)"
        />
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Type a city like Lecce, Italy — tap Search when ready.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Check in
          </label>
          <input
            type="date"
            value={checkIn}
            onChange={(event) => {
              userEditedRef.current = true;
              setCheckIn(event.target.value);
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Check out
          </label>
          <input
            type="date"
            value={checkOut}
            onChange={(event) => {
              userEditedRef.current = true;
              setCheckOut(event.target.value);
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {message ? <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{message}</p> : null}

      <button
        type="button"
        onClick={launchSearch}
        className="mt-4 w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm active:opacity-80"
      >
        Search hotels
      </button>
    </section>
  );
}
