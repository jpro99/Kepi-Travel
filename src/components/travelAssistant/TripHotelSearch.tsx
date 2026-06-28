"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HotelDetailSheet } from "@/components/travelAssistant/HotelDetailSheet";
import { HotelRankCard } from "@/components/travelAssistant/HotelRankCard";
import { HotelStayMap } from "@/components/travelAssistant/HotelStayMap";
import {
  attachHotelCoordinates,
  hotelInBounds,
  type MapBounds,
} from "@/lib/hotels/hotelCoordinates";
import { suggestAirports, type AirportResult } from "@/lib/airports/lookup";
import { suggestHotelDestinations } from "@/lib/hotels/destinationAliases";
import {
  SEARCH_INPUT_LIGHT,
  SEARCH_LABEL,
  SEARCH_PRIMARY_BUTTON,
} from "@/lib/ui/searchResponsive";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";
import { HotelChainFilterBar } from "@/components/travelAssistant/ChainFilterBar";
import {
  enabledHotelChainIds,
  loadHotelChainToggles,
  saveHotelChainToggles,
  type ChainToggleMap,
} from "@/lib/loyalty/chainFilterPrefs";
import { HotelFilteredOutSheet, type FilteredHotelRow } from "@/components/travelAssistant/HotelFilteredOutSheet";
import { HotelStayPreferencesSheet } from "@/components/travelAssistant/HotelStayPreferencesSheet";
import {
  computeLivePriceBounds,
  evaluateHotelMatch,
  hotelPassesFilters,
} from "@/lib/hotels/hotelSearchFilters";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import { hotelParticipatesInPoints, matchHotelChain, type HotelChainId } from "@/lib/loyalty/chainRegistry";

type PayMode = "any" | "cash" | "points";
type SortMode = "browse" | "price" | "rating" | "match" | "points";
type ResultsView = "map" | "list";

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
  onSavedToTrip?: (hotel: HotelSearchResult) => void;
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
  onSavedToTrip,
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
  const [preferenceInsight, setPreferenceInsight] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [payMode, setPayMode] = useState<PayMode>("any");
  const [sortMode, setSortMode] = useState<SortMode>("browse");
  const [showNearby, setShowNearby] = useState(false);
  const [inventoryNote, setInventoryNote] = useState<string | null>(null);
  const [googleHotelsUrl, setGoogleHotelsUrl] = useState<string | null>(null);
  const [inCityCount, setInCityCount] = useState(0);
  const [resultsView, setResultsView] = useState<ResultsView>("map");
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const [detailHotelId, setDetailHotelId] = useState<string | null>(null);
  const [savedHotelIds, setSavedHotelIds] = useState<Set<string>>(new Set());
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [hotelsWithCoords, setHotelsWithCoords] = useState<Array<RankedHotelSearchResult & { lat: number; lng: number }>>([]);
  const [learningNote, setLearningNote] = useState<string | null>(null);
  const [memberHotelPricing, setMemberHotelPricing] = useState(false);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [chainToggles, setChainToggles] = useState<ChainToggleMap<HotelChainId>>(() => loadHotelChainToggles());
  const [chainFilterCollapsed, setChainFilterCollapsed] = useState(true);
  const [stayProfile, setStayProfile] = useState<HotelStayProfile | null>(null);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(500);
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 500, hasLiveRates: false });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const autoSearchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void fetch("/api/hotels/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { profile?: HotelStayProfile } | null) => {
        if (payload?.profile) setStayProfile(payload.profile);
      })
      .catch(() => {});
  }, []);

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
    if (!checkIn.trim() || !checkOut.trim()) {
      setError("Select check-in and check-out dates.");
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
    setPreferenceInsight(null);
    setShowResults(true);

    try {
      const response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, checkIn, checkOut, guests, rooms }),
      });
      const payload = (await response.json()) as {
        error?: string;
        suggestions?: string[];
        detail?: { errors?: Array<{ message?: string }> };
        hotels?: RankedHotelSearchResult[];
        city?: string;
        correctedFrom?: string | null;
        preferenceInsight?: string | null;
        inventoryNote?: string | null;
        googleHotelsUrl?: string | null;
        inCityCount?: number;
        nearbyCount?: number;
        memberHotelPricing?: boolean;
        resolved?: { lat: number; lng: number; iata?: string | null };
      };
      if (!response.ok) {
        setError(payload.error ?? payload.detail?.errors?.[0]?.message ?? "Hotel search failed.");
        setErrorSuggestions(payload.suggestions ?? []);
        return;
      }
      setResults(payload.hotels ?? []);
      const bounds = computeLivePriceBounds(payload.hotels ?? []);
      setPriceBounds(bounds);
      setPriceMin(bounds.min);
      setPriceMax(bounds.max);
      setResolvedCity(payload.city ?? destination);
      setCorrectedFrom(payload.correctedFrom ?? null);
      setPreferenceInsight(payload.preferenceInsight ?? null);
      setInventoryNote(payload.inventoryNote ?? null);
      setGoogleHotelsUrl(payload.googleHotelsUrl ?? null);
      setInCityCount(payload.inCityCount ?? 0);
      setMemberHotelPricing(Boolean(payload.memberHotelPricing));
      setShowNearby(false);
      setSortMode("browse");
      if (payload.resolved?.lat && payload.resolved?.lng) {
        setCityCenter({ lat: payload.resolved.lat, lng: payload.resolved.lng });
        setHotelsWithCoords(
          attachHotelCoordinates(
            payload.hotels ?? [],
            payload.resolved.lat,
            payload.resolved.lng,
            payload.city ?? resolvedCity ?? city,
          ),
        );
      } else if ((payload.hotels?.length ?? 0) > 0) {
        setCityCenter(null);
        setHotelsWithCoords([]);
      } else {
        setCityCenter(null);
        setHotelsWithCoords([]);
      }
      setLearningNote(null);
      setResultsView("map");
      setMapSelectedId(payload.hotels?.[0]?.id ?? null);
      setDetailHotelId(null);
      setMapBounds(null);
      if ((payload.hotels?.length ?? 0) === 0) {
        setError(payload.error ?? `No hotels found near ${payload.city ?? destination}.`);
      }
      if (!payload.resolved?.lat && payload.city) {
        setError((prev) => prev ?? `Could not place ${payload.city} on the map. Try an airport code (e.g. BRI).`);
      }
    } catch {
      setError("Connection error — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const key = `${defaultCity}|${defaultCityIata}|${defaultCheckIn}|${defaultCheckOut}`;
    if (!defaultCity.trim() || !defaultCheckIn || !defaultCheckOut) return;
    if (autoSearchKeyRef.current === key) return;
    autoSearchKeyRef.current = key;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCity, defaultCityIata, defaultCheckIn, defaultCheckOut]);

  const enabledChains = useMemo(() => new Set(enabledHotelChainIds(chainToggles)), [chainToggles]);

  const handleChainToggle = (id: HotelChainId, enabled: boolean): void => {
    setChainToggles((prev) => {
      const next = { ...prev, [id]: enabled };
      saveHotelChainToggles(next);
      return next;
    });
  };

  const chainFilteredResults = useMemo(() => {
    let rows = results.filter((hotel) => !dismissedIds.has(hotel.id));

    if (payMode === "points") {
      rows = rows.filter((hotel) => hotelParticipatesInPoints(hotel.chainName, hotel.name));
    }

    rows = rows.filter((hotel) => {
      const chainId = matchHotelChain(hotel.chainName, hotel.name);
      if (!chainId) return payMode !== "points";
      return enabledChains.has(chainId);
    });

    if (!showNearby) {
      rows = rows.filter((hotel) => hotel.inSearchCity !== false);
    }
    if (sortMode === "points" || payMode === "points") {
      rows = rows.filter((hotel) => hotel.pointsOption && hotel.pointsOption.milesNeeded > 0);
      rows.sort((a, b) => {
        const aCpp = a.pointsOption?.cppAchieved ?? 0;
        const bCpp = b.pointsOption?.cppAchieved ?? 0;
        if (aCpp !== bCpp) return bCpp - aCpp;
        return a.rank - b.rank;
      });
    } else if (sortMode === "price" || sortMode === "browse" || payMode === "cash") {
      rows.sort((a, b) => {
        const aLive = !a.browseOnly && a.pricePerNight > 0;
        const bLive = !b.browseOnly && b.pricePerNight > 0;
        if (aLive !== bLive) return aLive ? -1 : 1;
        if (!aLive) return (b.rating ?? b.stars) - (a.rating ?? a.stars);
        return a.pricePerNight - b.pricePerNight;
      });
    } else if (sortMode === "rating") {
      rows.sort((a, b) => (b.rating ?? b.stars) - (a.rating ?? a.stars));
    } else if (sortMode === "match") {
      rows.sort((a, b) => a.rank - b.rank);
    }
    return rows;
  }, [results, dismissedIds, payMode, sortMode, showNearby, enabledChains]);

  const visibleResults = useMemo(() => {
    return chainFilteredResults.filter((hotel) =>
      hotelPassesFilters(hotel, stayProfile, priceMin, priceMax, priceBounds),
    );
  }, [chainFilteredResults, stayProfile, priceMin, priceMax, priceBounds]);

  const hiddenRows: FilteredHotelRow[] = useMemo(() => {
    const visibleIds = new Set(visibleResults.map((hotel) => hotel.id));
    return chainFilteredResults
      .filter((hotel) => !visibleIds.has(hotel.id))
      .map((hotel) => ({
        hotel,
        evaluation: evaluateHotelMatch(hotel, stayProfile, priceMin, priceMax, {
          catalogMin: priceBounds.min,
          catalogMax: priceBounds.max,
        }),
      }));
  }, [chainFilteredResults, visibleResults, stayProfile, priceMin, priceMax, priceBounds]);

  const inCityHotels = useMemo(
    () => visibleResults.filter((hotel) => hotel.inSearchCity !== false),
    [visibleResults],
  );
  const nearbyHotels = useMemo(
    () => visibleResults.filter((hotel) => hotel.inSearchCity === false),
    [visibleResults],
  );

  const mappedHotels = useMemo(() => {
    if (hotelsWithCoords.length > 0) {
      const visibleIds = new Set(visibleResults.map((row) => row.id));
      return hotelsWithCoords.filter((row) => visibleIds.has(row.id));
    }
    if (!cityCenter) return [];
    return attachHotelCoordinates(visibleResults, cityCenter.lat, cityCenter.lng, resolvedCity ?? city);
  }, [cityCenter, hotelsWithCoords, visibleResults]);

  const hotelsInView = useMemo(() => {
    if (!mapBounds) return mappedHotels;
    return mappedHotels.filter((hotel) => hotelInBounds(hotel, mapBounds));
  }, [mappedHotels, mapBounds]);

  const detailHotel = results.find((row) => row.id === detailHotelId && !dismissedIds.has(row.id)) ?? null;

  const openDetail = (hotel: RankedHotelSearchResult): void => {
    setMapSelectedId(hotel.id);
    setDetailHotelId(hotel.id);
  };

  const handleSaveToTrip = (hotel: RankedHotelSearchResult): void => {
    void recordHotelMemory({ action: "saved", hotel, city: resolvedCity ?? city });
    onAddHotel(hotel);
    onSavedToTrip?.(hotel);
    setSavedHotelIds((prev) => new Set([...prev, hotel.id]));
  };

  const handleDismiss = (hotel: RankedHotelSearchResult): void => {
    setDismissedIds((prev) => new Set([...prev, hotel.id]));
    if (detailHotelId === hotel.id) setDetailHotelId(null);
    void recordHotelMemory({ action: "dismissed", hotel, city: resolvedCity ?? city }).then((summary) => {
      setLearningNote(summary ?? `Got it — we'll adjust future picks.`);
      if (summary) setPreferenceInsight(summary);
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
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>
        {errorSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {errorSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => applyDestinationSuggestion(suggestion)}
                className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderHotelRow = (hotel: RankedHotelSearchResult): ReactNode => (
    <div key={hotel.id} data-hotel-id={hotel.id}>
      <HotelRankCard
        hotel={hotel}
        totalInSearch={results.length}
        compact
        payMode={payMode}
        selected={mapSelectedId === hotel.id || detailHotelId === hotel.id}
        onSelect={() => openDetail(hotel)}
        onAdd={() => openDetail(hotel)}
        onDismiss={() => handleDismiss(hotel)}
      />
    </div>
  );

  const renderHotelListSections = (): ReactNode => {
    if (showNearby && nearbyHotels.length > 0 && inCityHotels.length > 0) {
      return (
        <>
          <p className="px-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            In {resolvedCity?.split(",")[0]?.trim() ?? "town"} ({inCityHotels.length})
          </p>
          {inCityHotels.map((hotel) => renderHotelRow(hotel))}
          <p className="mt-2 px-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Nearby ({nearbyHotels.length})
          </p>
          {nearbyHotels.map((hotel) => renderHotelRow(hotel))}
        </>
      );
    }
    return visibleResults.map((hotel) => renderHotelRow(hotel));
  };

  return (
    <div className="space-y-3">
      {!showResults ? (
        <>
          <CityInput
            label="City or destination"
            value={city}
            onChange={(display, iata) => {
              setCity(display);
              setCityIata(iata);
            }}
            placeholder="e.g. Rome, Venice, New York"
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>
              <label className={SEARCH_LABEL}>Check-in</label>
              <input type="date" value={checkIn} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCheckIn(e.target.value)} className={SEARCH_INPUT_LIGHT} />
            </div>
            <div>
              <label className={SEARCH_LABEL}>Check-out</label>
              <input type="date" value={checkOut} min={checkIn || new Date().toISOString().slice(0, 10)} onChange={(e) => setCheckOut(e.target.value)} className={SEARCH_INPUT_LIGHT} />
            </div>
            <div>
              <label className={SEARCH_LABEL}>Guests</label>
              <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={SEARCH_INPUT_LIGHT}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={SEARCH_LABEL}>Rooms</label>
              <select value={rooms} onChange={(e) => setRooms(Number(e.target.value))} className={SEARCH_INPUT_LIGHT}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          {error ? renderErrorWithSuggestions() : null}
          <button type="button" disabled={loading} onClick={() => void runSearch()} className={`${SEARCH_PRIMARY_BUTTON} bg-sky-600 text-white disabled:opacity-60`}>
            {loading ? "Searching…" : "Search hotels"}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{resolvedCity ?? city}</p>
              <p className="text-[11px] text-slate-500">
                {checkIn} → {checkOut} ·{" "}
                {mapBounds && resultsView === "map"
                  ? `${visibleResults.length} hotels · map shows all pins`
                  : `${visibleResults.length} hotels`}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setResultsView("map")} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${resultsView === "map" ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-600"}`}>Map</button>
              <button type="button" onClick={() => setResultsView("list")} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${resultsView === "list" ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-600"}`}>List</button>
              <button type="button" onClick={() => { setShowResults(false); setError(null); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Edit</button>
            </div>
          </div>

          {correctedFrom ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Showing hotels near <strong>{resolvedCity}</strong> (corrected from &ldquo;{correctedFrom}&rdquo;).</p>
          ) : null}

          {inventoryNote ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-[11px] leading-relaxed text-amber-950 dark:text-amber-100">{inventoryNote}</p>
              {googleHotelsUrl ? (
                <a
                  href={googleHotelsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-[11px] font-bold text-sky-700 underline dark:text-sky-300"
                >
                  Browse all hotels on Google →
                </a>
              ) : null}
            </div>
          ) : null}

          {(preferenceInsight || learningNote) && !inventoryNote ? (
            <p className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
              {learningNote ?? preferenceInsight}
            </p>
          ) : null}

          {savedHotelIds.size > 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              {savedHotelIds.size} hotel{savedHotelIds.size === 1 ? "" : "s"} saved to your trip — search stays open so you can compare more.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["any", "Cash + points"],
                ["cash", "Cash"],
                ["points", "Points"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setPayMode(mode);
                  if (mode === "points") setSortMode("points");
                  else if (sortMode === "points") setSortMode("browse");
                }}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  payMode === mode ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["browse", "Browse all"],
                ["price", "Lowest price"],
                ["rating", "Top rated"],
                ["match", "Best match"],
                ...(payMode === "points" || payMode === "any" ? ([["points", "Best points"]] as const) : []),
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  sortMode === mode ? "bg-slate-800 text-white" : "border border-slate-300 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
            {(results.length - inCityCount) > 0 ? (
              <button
                type="button"
                onClick={() => setShowNearby((value) => !value)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  showNearby ? "bg-sky-600 text-white" : "border border-sky-300 text-sky-700"
                }`}
              >
                {showNearby ? "In town only" : `+ Nearby (${results.length - inCityCount})`}
              </button>
            ) : null}
          </div>

          <HotelChainFilterBar
            toggles={chainToggles}
            onChange={handleChainToggle}
            collapsed={chainFilterCollapsed}
            onToggleCollapse={() => setChainFilterCollapsed((value) => !value)}
          />

          {payMode === "points" ? (
            <p className="text-[11px] text-emerald-800 dark:text-emerald-200">
              Points mode shows Hyatt, Marriott, Hilton, and IHG hotels on the map. Uncheck chains you don&apos;t want — booking opens their site with your dates filled in.
            </p>
          ) : null}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((key) => (
                <div key={key} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : null}

          {!loading ? renderErrorWithSuggestions() : null}

          {!loading && showResults && resultsView === "map" && cityCenter ? (
            <div className="-mx-1 flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(18rem,340px)_1fr] xl:items-start">
              <div className="order-2 flex min-h-0 flex-col xl:order-1 xl:max-h-[min(72vh,42rem)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {visibleResults.length} match
                    {hiddenRows.length > 0 ? ` · ${hiddenRows.length} hidden` : ""}
                  </p>
                  {hiddenRows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setHiddenOpen(true)}
                      className="text-[11px] font-bold text-amber-800 underline dark:text-amber-200"
                    >
                      Why hidden?
                    </button>
                  ) : null}
                </div>
                {visibleResults.length === 0 ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    No hotels match ${priceMin}–${priceMax}/night with your stay style. Widen the budget or tap <strong>Stay style</strong> on the map.
                  </p>
                ) : (
                  <div className="min-h-[14rem] flex-1 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 xl:max-h-[min(72vh,42rem)]">
                    {renderHotelListSections()}
                  </div>
                )}
              </div>

              <div className="order-1 min-w-0 xl:order-2">
                <HotelStayMap
                  city={resolvedCity ?? city}
                  centerLat={cityCenter.lat}
                  centerLng={cityCenter.lng}
                  hotels={mappedHotels}
                  selectedId={mapSelectedId}
                  onSelect={openDetail}
                  onBoundsChange={setMapBounds}
                  payMode={payMode}
                  expanded
                  priceMin={priceMin}
                  priceMax={priceMax}
                  priceBounds={{ min: priceBounds.min, max: priceBounds.max }}
                  onPriceRangeChange={(min, max) => {
                    setPriceMin(min);
                    setPriceMax(max);
                  }}
                  onOpenPreferences={() => setPrefsOpen(true)}
                  hiddenCount={hiddenRows.length}
                  onShowHidden={() => setHiddenOpen(true)}
                />
                {detailHotel ? null : visibleResults.length > 0 ? (
                  <p className="mt-2 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-center text-sm text-slate-500 dark:border-slate-700">
                    Tap a price pin or pick from the list — green pins are your best Kepi matches.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loading && visibleResults.length > 0 && resultsView === "list" ? (
            <div className="space-y-3">
              <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
                {visibleResults.map((hotel) => renderHotelRow(hotel))}
              </div>
            </div>
          ) : null}

          {detailHotel ? (
            <HotelDetailSheet
              hotel={detailHotel}
              allHotels={visibleResults}
              city={resolvedCity ?? city}
              memberHotelPricing={memberHotelPricing}
              payMode={payMode}
              saved={savedHotelIds.has(detailHotel.id)}
              usePoints={payMode === "points"}
              onSaveToTrip={() => handleSaveToTrip(detailHotel)}
              onClose={() => setDetailHotelId(null)}
            />
          ) : null}

          <HotelStayPreferencesSheet
            open={prefsOpen}
            onClose={() => setPrefsOpen(false)}
            priceMin={priceMin}
            priceMax={priceMax}
            priceBounds={{ min: priceBounds.min, max: priceBounds.max }}
            onPriceChange={(min, max) => {
              setPriceMin(min);
              setPriceMax(max);
            }}
            onProfileSaved={(profile) => {
              setStayProfile(profile);
              setPreferenceInsight(null);
            }}
            hiddenCount={hiddenRows.length}
            onShowHidden={() => setHiddenOpen(true)}
          />

          <HotelFilteredOutSheet
            open={hiddenOpen}
            onClose={() => setHiddenOpen(false)}
            rows={hiddenRows}
            onAdjustPreferences={() => setPrefsOpen(true)}
          />
        </>
      )}
    </div>
  );
}
