"use client";

import { useState } from "react";
import Link from "next/link";
import { HotelCityField } from "@/components/travelAssistant/HotelCityField";
import { useHotelSearchFields } from "@/lib/hotels/useHotelSearchFields";

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

export function HotelSearchLauncher({ tripName, defaults, onSearch }: HotelSearchLauncherProps) {
  const {
    city,
    cityIata,
    checkIn,
    checkOut,
    setCityField,
    clearCityField,
    setCheckIn,
    setCheckOut,
  } = useHotelSearchFields(defaults ?? {});
  const [message, setMessage] = useState<string | null>(null);

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
        <HotelCityField
          compact
          label="Destination"
          value={city}
          cityIata={cityIata}
          onChange={setCityField}
          onClear={clearCityField}
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
            onChange={(event) => setCheckIn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Check out
          </label>
          <input
            type="date"
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {message ? <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">{message}</p> : null}

      <button
        type="button"
        data-testid="hotel-search-launcher-submit"
        onClick={launchSearch}
        className="mt-4 w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md active:opacity-90"
      >
        Search hotels
      </button>
    </section>
  );
}
