"use client";

import { useEffect, useRef, useState } from "react";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import type { HotelSearchResult, HotelSearchTier, RankedHotelSearchResult } from "@/lib/hotels/types";

export interface TripHotelSearchProps {
  defaultCity?: string;
  defaultCityIata?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  onAddHotel: (hotel: HotelSearchResult) => void;
}

function starLabel(count: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(count)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function tierHeading(tier: HotelSearchTier): string | null {
  switch (tier) {
    case "kepi_pick":
      return "Kepi Pick — best deal in town";
    case "points_play":
      return "Best points play";
    case "personal":
      return "Matches your stay style";
    case "best_value":
      return "Best value for what you get";
    case "best_quality":
      return "Top quality in this search";
    default:
      return null;
  }
}

function tierCardClass(tier: HotelSearchTier): string {
  switch (tier) {
    case "kepi_pick":
      return "border-[#f4c95d] bg-gradient-to-br from-[#0b1f3a] to-[#123456] text-white shadow-md";
    case "points_play":
      return "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/40";
    case "personal":
      return "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30";
    case "best_value":
      return "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30";
    case "best_quality":
      return "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30";
    default:
      return "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50";
  }
}

async function recordHotelMemory(event: {
  action: "saved" | "dismissed" | "liked";
  hotel: RankedHotelSearchResult;
  city: string;
}): Promise<void> {
  try {
    await fetch("/api/hotels/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: event.action,
        hotelId: event.hotel.id,
        hotelName: event.hotel.name,
        chainName: event.hotel.chainName,
        city: event.city,
        nightlyUsd: Math.round(event.hotel.pricePerNight),
        stars: event.hotel.stars,
        amenities: event.hotel.amenities,
      }),
    });
  } catch {
    /* non-fatal */
  }
}

function CityInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (display: string, iata: string) => void;
  placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next, "");
          const matches = suggestAirports(next);
          setSuggestions(matches);
          setOpen(matches.length > 0);
        }}
        onFocus={() => {
          if (value.length >= 2) {
            const matches = suggestAirports(value);
            setSuggestions(matches);
            setOpen(matches.length > 0);
          }
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 focus-visible:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
      />
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
              className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-sky-600">{airport.iata}</span>
              <span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{airport.city}</p>
                <p className="text-xs text-slate-500">{airport.name}</p>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TripHotelSearch({
  defaultCity = "",
  defaultCityIata = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  onAddHotel,
}: TripHotelSearchProps) {
  const [city, setCity] = useState(defaultCity);
  const [cityIata, setCityIata] = useState(defaultCityIata);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RankedHotelSearchResult[]>([]);
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<"duffel" | "estimated" | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCity(defaultCity);
    setCityIata(defaultCityIata);
    setCheckIn(defaultCheckIn);
    setCheckOut(defaultCheckOut);
  }, [defaultCity, defaultCityIata, defaultCheckIn, defaultCheckOut]);

  const runSearch = async (): Promise<void> => {
    const destination = cityIata || city.trim();
    if (!destination) {
      setError("Enter a city or destination.");
      return;
    }
    if (!checkIn.trim()) {
      setError("Select a check-in date.");
      return;
    }
    if (!checkOut.trim()) {
      setError("Select a check-out date.");
      return;
    }
    if (checkOut <= checkIn) {
      setError("Check-out must be after check-in.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setDismissedIds(new Set());
    setSearchNotice(null);
    setSearchSource(null);
    setShowResults(true);

    try {
      const response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          checkIn,
          checkOut,
          guests,
          rooms,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        detail?: { errors?: Array<{ message?: string }> };
        hotels?: RankedHotelSearchResult[];
        city?: string;
        memorySummary?: string | null;
        notice?: string;
        source?: "duffel" | "estimated";
      };
      if (!response.ok) {
        const duffelMessage = payload.detail?.errors?.[0]?.message;
        setError(payload.error ?? duffelMessage ?? "Hotel search failed.");
        return;
      }
      setResults(payload.hotels ?? []);
      setResolvedCity(payload.city ?? destination);
      setMemorySummary(payload.memorySummary ?? null);
      setSearchNotice(payload.notice ?? null);
      setSearchSource(payload.source ?? null);
      if ((payload.hotels?.length ?? 0) > 0) {
        setError(null);
      } else if (payload.error) {
        setError(payload.error);
      } else {
        setError(`No hotels found near ${payload.city ?? destination}. Try different dates or a nearby airport code.`);
      }
    } catch {
      setError("Connection error — try again.");
    } finally {
      setLoading(false);
    }
  };

  const visibleResults = results.filter((hotel) => !dismissedIds.has(hotel.id));

  const handleAdd = (hotel: RankedHotelSearchResult): void => {
    void recordHotelMemory({ action: "saved", hotel, city: resolvedCity ?? city });
    onAddHotel(hotel);
  };

  const handleDismiss = (hotel: RankedHotelSearchResult): void => {
    setDismissedIds((prev) => new Set([...prev, hotel.id]));
    void recordHotelMemory({ action: "dismissed", hotel, city: resolvedCity ?? city });
  };

  return (
    <div className="space-y-4">
      {!showResults ? (
        <>
          <CityInput
            label="City or destination"
            value={city}
            onChange={(display, iata) => {
              setCity(display);
              setCityIata(iata);
            }}
            placeholder="e.g. Rome, Bari, New York, Beaumont CA"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Check-in</label>
              <input
                type="date"
                value={checkIn}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setCheckIn(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Check-out</label>
              <input
                type="date"
                value={checkOut}
                min={checkIn || new Date().toISOString().slice(0, 10)}
                onChange={(event) => setCheckOut(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Guests</label>
              <select
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "guest" : "guests"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms</label>
              <select
                value={rooms}
                onChange={(event) => setRooms(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "room" : "rooms"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSearch()}
            className="w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-black text-white disabled:opacity-60"
          >
            {loading ? "Searching hotels…" : "Search hotels"}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{resolvedCity ?? city}</p>
              <p className="text-xs text-slate-500">
                {checkIn} → {checkOut}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowResults(false);
                setError(null);
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              Edit search
            </button>
          </div>

          {searchNotice ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {searchNotice}
              {searchSource === "estimated" ? (
                <>
                  {" "}
                  <a
                    href="https://duffel.com/docs/guides/getting-started-with-stays"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    Enable live Stays in Duffel →
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          {memorySummary ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
              {memorySummary}
            </p>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Kepi ranks every result for value, quality, points, and what you&apos;ve saved before. Add hotels you like — we learn your style over time.
            </p>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((key) => (
                <div key={key} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : null}

          {error && !loading ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>
          ) : null}

          {!loading && visibleResults.length > 0 ? (
            <div className="space-y-3">
              {visibleResults.map((hotel) => {
                const heading = tierHeading(hotel.tier);
                const isKepiPick = hotel.tier === "kepi_pick";
                const textMuted = isKepiPick ? "text-slate-300" : "text-slate-500";
                const textPrimary = isKepiPick ? "text-white" : "text-slate-900 dark:text-white";

                return (
                  <div key={hotel.id} className={`rounded-2xl border p-4 ${tierCardClass(hotel.tier)}`}>
                    {heading ? (
                      <p className={`mb-2 text-[10px] font-black uppercase tracking-widest ${isKepiPick ? "text-[#f4c95d]" : "text-sky-700 dark:text-sky-300"}`}>
                        {heading}
                      </p>
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-bold ${textPrimary}`}>{hotel.name}</p>
                        {hotel.chainName ? <p className={`text-xs ${textMuted}`}>{hotel.chainName}</p> : null}
                        <p className={`mt-1 text-xs ${isKepiPick ? "text-[#f4c95d]" : "text-amber-600 dark:text-amber-400"}`}>
                          {starLabel(hotel.stars)}
                          {hotel.rating !== undefined ? ` · ${hotel.rating.toFixed(1)} guest score` : ""}
                        </p>
                        {hotel.whyLine ? <p className={`mt-1.5 text-xs ${textMuted}`}>{hotel.whyLine}</p> : null}
                        {hotel.badges.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {hotel.badges.map((badge) => (
                              <span
                                key={badge}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isKepiPick
                                    ? "bg-[#f4c95d]/20 text-[#f4c95d]"
                                    : "bg-white/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                }`}
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {hotel.pointsOption ? (
                          <p className={`mt-2 text-xs ${isKepiPick ? "text-sky-200" : "text-sky-700 dark:text-sky-300"}`}>
                            Points: {hotel.pointsOption.programName} · {hotel.pointsOption.milesNeeded.toLocaleString()} pts ·{" "}
                            {hotel.pointsOption.cppAchieved.toFixed(1)}¢/pt
                          </p>
                        ) : null}
                        {hotel.address ? <p className={`mt-1 truncate text-xs ${textMuted}`}>{hotel.address}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-lg font-black ${textPrimary}`}>${Math.round(hotel.pricePerNight)}</p>
                        <p className={`text-[10px] ${textMuted}`}>/ night</p>
                        <p className={`text-xs ${textMuted}`}>${Math.round(hotel.totalPrice)} total</p>
                        <p className={`mt-1 text-[10px] ${textMuted}`}>#{hotel.rank} of {results.length}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAdd(hotel)}
                        className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                          isKepiPick ? "bg-[#f4c95d] text-[#0b1f3a]" : "bg-[#0b1f3a] text-[#f4c95d]"
                        }`}
                      >
                        Add to my trip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(hotel)}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                          isKepiPick
                            ? "border-slate-500 text-slate-300 hover:bg-white/10"
                            : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        }`}
                      >
                        Not for me
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
