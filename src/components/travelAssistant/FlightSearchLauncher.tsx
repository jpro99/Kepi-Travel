"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import {
  buildFlightSearchPlan,
  type FlightSearchPlan,
  type PlannedFlightLeg,
} from "@/lib/travelAssistant/tripPlanBooking";
import { useStableDefaultSync } from "@/lib/ui/useStableDefaultSync";

export interface FlightSearchDefaults {
  fromIata?: string;
  toIata?: string;
  fromLabel?: string;
  toLabel?: string;
  departDate?: string;
  returnDate?: string;
}

interface FlightSearchLauncherProps {
  tripName?: string | null;
  defaults?: FlightSearchDefaults;
  onSearch: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
}

function AirportField({
  label,
  value,
  iata,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  iata: string;
  onChange: (display: string, code: string) => void;
  placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
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
          onChange(event.target.value, "");
          const next = suggestAirports(event.target.value);
          setSuggestions(next);
          setOpen(next.length > 0);
        }}
        onFocus={() => {
          if (value.length >= 2) {
            const next = suggestAirports(value);
            setSuggestions(next);
            setOpen(next.length > 0);
          }
        }}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
      />
      {iata ? <p className="mt-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">{iata}</p> : null}
      {open && suggestions.length > 0 ? (
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
        </div>
      ) : null}
    </div>
  );
}

function buildLeg(input: {
  fromIata: string;
  toIata: string;
  fromLabel: string;
  toLabel: string;
  departDate: string;
  returnDate?: string;
}): { plan: FlightSearchPlan; legs: PlannedFlightLeg[] } {
  const outbound: PlannedFlightLeg = {
    id: "custom-outbound",
    role: "outbound",
    fromIata: input.fromIata.toUpperCase(),
    toIata: input.toIata.toUpperCase(),
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
    enabled: true,
    optional: false,
    departureDate: input.departDate,
    status: "needed",
  };

  const legs: PlannedFlightLeg[] = [outbound];
  if (input.returnDate?.trim()) {
    legs.push({
      id: "custom-return",
      role: "return",
      fromIata: input.toIata.toUpperCase(),
      toIata: input.fromIata.toUpperCase(),
      fromLabel: input.toLabel,
      toLabel: input.fromLabel,
      enabled: true,
      optional: false,
      departureDate: input.returnDate,
      status: "needed",
    });
  }

  const plan = buildFlightSearchPlan(legs);
  if (!plan) {
    return {
      plan: {
        mode: "oneway",
        summary: `${input.fromLabel} → ${input.toLabel} · ${input.departDate}`,
        url: "",
      },
      legs,
    };
  }
  return { plan, legs };
}

export function FlightSearchLauncher({ tripName, defaults, onSearch }: FlightSearchLauncherProps) {
  const [fromDisplay, setFromDisplay] = useState("");
  const [fromIata, setFromIata] = useState("");
  const [toDisplay, setToDisplay] = useState("");
  const [toIata, setToIata] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const defaultFromIata = defaults?.fromIata?.toUpperCase() ?? "";
  const defaultToIata = defaults?.toIata?.toUpperCase() ?? "";
  const defaultFromLabel = defaults?.fromLabel ?? "";
  const defaultToLabel = defaults?.toLabel ?? "";
  const defaultDepartDate = defaults?.departDate?.slice(0, 10) ?? "";
  const defaultReturnDate = defaults?.returnDate?.slice(0, 10) ?? "";
  const defaultsSyncKey = `${defaultFromIata}|${defaultToIata}|${defaultFromLabel}|${defaultToLabel}|${defaultDepartDate}|${defaultReturnDate}`;

  const applyDefaults = useCallback(() => {
    if (defaultFromIata) {
      setFromIata(defaultFromIata);
      setFromDisplay(defaultFromLabel ? `${defaultFromLabel} (${defaultFromIata})` : defaultFromIata);
    }
    if (defaultToIata) {
      setToIata(defaultToIata);
      setToDisplay(defaultToLabel ? `${defaultToLabel} (${defaultToIata})` : defaultToIata);
    }
    if (defaultDepartDate) setDepartDate(defaultDepartDate);
    if (defaultReturnDate) setReturnDate(defaultReturnDate);
  }, [
    defaultDepartDate,
    defaultFromIata,
    defaultFromLabel,
    defaultReturnDate,
    defaultToIata,
    defaultToLabel,
  ]);

  useStableDefaultSync(defaultsSyncKey, applyDefaults);

  const launchSearch = (): void => {
    setMessage(null);
    if (!fromIata.trim() || !toIata.trim()) {
      setMessage("Pick a departure and arrival airport from the suggestions.");
      return;
    }
    if (!departDate.trim()) {
      setMessage("Choose a departure date.");
      return;
    }
    const { plan, legs } = buildLeg({
      fromIata,
      toIata,
      fromLabel: fromDisplay.split("(")[0]?.trim() || fromIata,
      toLabel: toDisplay.split("(")[0]?.trim() || toIata,
      departDate: departDate.slice(0, 10),
      returnDate: returnDate.trim() ? returnDate.slice(0, 10) : undefined,
    });
    onSearch(plan, legs);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 shadow-sm dark:border-sky-500/30 dark:from-sky-950/40 dark:via-slate-900 dark:to-blue-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            Compare & decide
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Find flights — book on Google or airline</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {tripName ? `${tripName} · ` : ""}
            Compare cash and miles here. Book externally, then forward your confirmation to Kepi.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <AirportField
          label="From"
          value={fromDisplay}
          iata={fromIata}
          onChange={(display, code) => {
            setFromDisplay(display);
            setFromIata(code);
          }}
          placeholder="Ontario (ONT)"
        />
        <AirportField
          label="To"
          value={toDisplay}
          iata={toIata}
          onChange={(display, code) => {
            setToDisplay(display);
            setToIata(code);
          }}
          placeholder="Venice (VCE)"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Depart
          </label>
          <input
            type="date"
            value={departDate}
            onChange={(event) => setDepartDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Return (optional)
          </label>
          <input
            type="date"
            value={returnDate}
            onChange={(event) => setReturnDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {message ? <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{message}</p> : null}

      <button
        type="button"
        onClick={launchSearch}
        className="mt-4 w-full rounded-full bg-[#007AFF] px-5 py-3 text-sm font-black text-white shadow-sm active:opacity-80"
      >
        Search flights & prices
      </button>
    </section>
  );
}
