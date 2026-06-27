"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HotelRankCard, pickFeaturedHotels } from "@/components/travelAssistant/HotelRankCard";
import { HotelStayMap } from "@/components/travelAssistant/HotelStayMap";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import { suggestHotelDestinations } from "@/lib/hotels/destinationAliases";
import {
  SEARCH_INPUT_LIGHT,
  SEARCH_LABEL,
  SEARCH_PRIMARY_BUTTON,
} from "@/lib/ui/searchResponsive";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";

type PayMode = "any" | "cash" | "points";
type ResultsView = "picks" | "all" | "map";

async function recordHotelMemory(event: {
  action: "saved" | "dismissed" | "liked";
  hotel: RankedHotelSearchResult;
  city: string;
}): Promise<string | null> {
  try {
    const res = await fetch("/api/hotels/memory", {
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
    if (!res.ok) return null;
    const data = (await res.json()) as { summary?: string | null };
    return data.summary ?? null;
  } catch {
    return null;
  }
}

export interface TripHotelSearchProps {
  defaultCity?: string;
  defaultCityIata?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  onAddHotel: (hotel: HotelSearchResult) => void;
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
  const [cityHints, setCityHints] = useState<string[]>([]);
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
      <label className={SEARCH_LABEL}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
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
        className={SEARCH_INPUT_LIGHT}
      />
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
              className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-sky-600">{airport.iata}</span>
              <span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{airport.city}</p>
                <p className="text-xs text-slate-500">{airport.name}</p>
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
              className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="w-10 shrink-0 text-xs font-black text-emerald-600">City</span>
              <span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{hint}</p>
                <p className="text-xs text-slate-500">Tap to use this destination</p>
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
  const [errorSuggestions, setErrorSuggestions] = useState<string[]>([]);
  const [correctedFrom, setCorrectedFrom] = useState<string | null>(null);
  const [results, setResults] = useState<RankedHotelSearchResult[]>([]);
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  const [stayProfileSummary, setStayProfileSummary] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<"duffel" | "liteapi" | "estimated" | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [payMode, setPayMode] = useState<PayMode>("any");
  const [resultsView, setResultsView] = useState<ResultsView>("picks");
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [learningNote, setLearningNote] = useState<string | null>(null);

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
    setErrorSuggestions([]);
    setCorrectedFrom(null);
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
        suggestions?: string[];
        detail?: { errors?: Array<{ message?: string }> };
        hotels?: RankedHotelSearchResult[];
        city?: string;
        correctedFrom?: string | null;
        memorySummary?: string | null;
        stayProfileSummary?: string | null;
        notice?: string;
        source?: "duffel" | "liteapi" | "estimated";
        resolved?: { lat: number; lng: number; iata?: string | null };
      };
      if (!response.ok) {
        const duffelMessage = payload.detail?.errors?.[0]?.message;
        setError(payload.error ?? duffelMessage ?? "Hotel search failed.");
        setErrorSuggestions(payload.suggestions ?? []);
        return;
      }
      setResults(payload.hotels ?? []);
      setResolvedCity(payload.city ?? destination);
      setCorrectedFrom(payload.correctedFrom ?? null);
      setMemorySummary(payload.memorySummary ?? null);
      setStayProfileSummary(payload.stayProfileSummary ?? null);
      setSearchNotice(payload.notice ?? null);
      setSearchSource(payload.source ?? null);
      if (payload.resolved?.lat && payload.resolved?.lng) {
        setCityCenter({ lat: payload.resolved.lat, lng: payload.resolved.lng });
      }
      setLearningNote(null);
      setResultsView("picks");
      setShowAllPicks(false);
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

  const visibleResults = useMemo(() => {
    let rows = results.filter((hotel) => !dismissedIds.has(hotel.id));
    if (payMode === "points") {
      rows = rows.filter((hotel) => hotel.pointsOption && hotel.pointsOption.cppAchieved >= 0.8);
      rows.sort((a, b) => (b.pointsOption?.cppAchieved ?? 0) - (a.pointsOption?.cppAchieved ?? 0));
    } else if (payMode === "cash") {
      rows.sort((a, b) => a.pricePerNight - b.pricePerNight);
    }
    return rows;
  }, [results, dismissedIds, payMode]);

  const featuredHotels = useMemo(() => pickFeaturedHotels(visibleResults, 3), [visibleResults]);
  const featuredIds = useMemo(() => new Set(featuredHotels.map((row) => row.id)), [featuredHotels]);
  const moreHotels = useMemo(
    () => visibleResults.filter((row) => !featuredIds.has(row.id)),
    [visibleResults, featuredIds],
  );

  const handleAdd = (hotel: RankedHotelSearchResult): void => {
    void recordHotelMemory({ action: "saved", hotel, city: resolvedCity ?? city });
    onAddHotel(hotel);
  };

  const handleDismiss = (hotel: RankedHotelSearchResult): void => {
    setDismissedIds((prev) => new Set([...prev, hotel.id]));
    void recordHotelMemory({ action: "dismissed", hotel, city: resolvedCity ?? city }).then((summary) => {
      setLearningNote(
        summary ??
          `Got it — we’ll show fewer ${hotel.chainName ? `${hotel.chainName} ` : ""}options like this next time.`,
      );
      if (summary) setMemorySummary(summary);
    });
  };

  const applyDestinationSuggestion = (suggestion: string): void => {
    const iataMatch = suggestion.match(/\(([A-Z]{3})\)/);
    setCity(suggestion);
    setCityIata(iataMatch?.[1] ?? "");
    setError(null);
    setErrorSuggestions([]);
    setShowResults(false);
  };

  const renderErrorWithSuggestions = (): ReactNode => {
    if (!error) return null;
    return (
      <div className="space-y-2">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>
        {errorSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {errorSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => applyDestinationSuggestion(suggestion)}
                className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-5">
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
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <div>
              <label className={SEARCH_LABEL}>Check-in</label>
              <input
                type="date"
                value={checkIn}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setCheckIn(event.target.value)}
                className={SEARCH_INPUT_LIGHT}
              />
            </div>
            <div>
              <label className={SEARCH_LABEL}>Check-out</label>
              <input
                type="date"
                value={checkOut}
                min={checkIn || new Date().toISOString().slice(0, 10)}
                onChange={(event) => setCheckOut(event.target.value)}
                className={SEARCH_INPUT_LIGHT}
              />
            </div>
            <div>
              <label className={SEARCH_LABEL}>Guests</label>
              <select
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
                className={SEARCH_INPUT_LIGHT}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "guest" : "guests"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={SEARCH_LABEL}>Rooms</label>
              <select
                value={rooms}
                onChange={(event) => setRooms(Number(event.target.value))}
                className={SEARCH_INPUT_LIGHT}
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "room" : "rooms"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? renderErrorWithSuggestions() : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSearch()}
            className={`${SEARCH_PRIMARY_BUTTON} bg-sky-600 text-white disabled:opacity-60`}
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

          {correctedFrom ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              Showing hotels near <strong>{resolvedCity}</strong> — we corrected &ldquo;{correctedFrom}&rdquo;.
            </p>
          ) : null}

          {searchNotice ? (
            <p
              className={`rounded-xl border px-3 py-2 text-xs ${
                searchSource === "estimated"
                  ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
              }`}
            >
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

          {stayProfileSummary ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              {stayProfileSummary}
            </p>
          ) : null}

          {learningNote ? (
            <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
              {learningNote}
            </p>
          ) : null}

          {memorySummary ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
              {memorySummary}
            </p>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Ranked by value, quality, points, and your past picks. Tap &ldquo;Not for me&rdquo; — Kepi adjusts the next results.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(["any", "cash", "points"] as PayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPayMode(mode)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  payMode === mode
                    ? "bg-[#0b1f3a] text-[#f4c95d]"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                {mode === "any" ? "Best overall" : mode === "cash" ? "Cash" : "Points"}
              </button>
            ))}
            {(["picks", "all", "map"] as ResultsView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setResultsView(view)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  resultsView === view
                    ? "bg-sky-600 text-white"
                    : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                {view === "picks" ? "Top picks" : view === "all" ? `All (${visibleResults.length})` : "Map"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((key) => (
                <div key={key} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : null}

          {!loading ? renderErrorWithSuggestions() : null}

          {!loading && visibleResults.length > 0 && resultsView === "map" && cityCenter ? (
            <div className="space-y-3">
              <HotelStayMap
                city={resolvedCity ?? city}
                centerLat={cityCenter.lat}
                centerLng={cityCenter.lng}
                hotels={visibleResults}
                selectedId={mapSelectedId}
                onSelect={(hotel) => setMapSelectedId(hotel.id)}
              />
              {mapSelectedId ? (
                (() => {
                  const selected = visibleResults.find((row) => row.id === mapSelectedId);
                  if (!selected) return null;
                  return (
                    <HotelRankCard
                      hotel={selected}
                      totalInSearch={results.length}
                      featured
                      onAdd={() => handleAdd(selected)}
                      onDismiss={() => handleDismiss(selected)}
                    />
                  );
                })()
              ) : null}
            </div>
          ) : null}

          {!loading && visibleResults.length > 0 && resultsView === "picks" ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kepi&apos;s top 3 for this stay</p>
              <div className="space-y-3">
                {featuredHotels.map((hotel) => (
                  <HotelRankCard
                    key={hotel.id}
                    hotel={hotel}
                    totalInSearch={results.length}
                    featured
                    onAdd={() => handleAdd(hotel)}
                    onDismiss={() => handleDismiss(hotel)}
                  />
                ))}
              </div>
              {moreHotels.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAllPicks((value) => !value)}
                    className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    {showAllPicks ? "Hide" : "Show"} {moreHotels.length} more ranked option{moreHotels.length === 1 ? "" : "s"}
                  </button>
                  {showAllPicks ? (
                    <div className="space-y-2">
                      {moreHotels.map((hotel) => (
                        <HotelRankCard
                          key={hotel.id}
                          hotel={hotel}
                          totalInSearch={results.length}
                          onAdd={() => handleAdd(hotel)}
                          onDismiss={() => handleDismiss(hotel)}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {!loading && visibleResults.length > 0 && resultsView === "all" ? (
            <div className="space-y-2">
              {visibleResults.map((hotel) => (
                <HotelRankCard
                  key={hotel.id}
                  hotel={hotel}
                  totalInSearch={results.length}
                  onAdd={() => handleAdd(hotel)}
                  onDismiss={() => handleDismiss(hotel)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
