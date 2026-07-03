"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HotelDetailSheet } from "@/components/travelAssistant/HotelDetailSheet";
import { HotelRankCard, pickFeaturedHotels } from "@/components/travelAssistant/HotelRankCard";
import { HotelStayMap } from "@/components/travelAssistant/HotelStayMap";
import {
  attachHotelCoordinates,
  filterHotelsWithinRenderDistance,
} from "@/lib/hotels/hotelCoordinates";
import { HotelCityField } from "@/components/travelAssistant/HotelCityField";
import { useHotelSearchFields } from "@/lib/hotels/useHotelSearchFields";
import {
  SEARCH_INPUT_LIGHT,
  SEARCH_LABEL,
  SEARCH_PRIMARY_BUTTON,
} from "@/lib/ui/searchResponsive";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";
import {
  enabledHotelChainIds,
  loadHotelChainToggles,
  saveHotelChainToggles,
  type ChainToggleMap,
} from "@/lib/loyalty/chainFilterPrefs";
import { HotelFilteredOutSheet, type FilteredHotelRow } from "@/components/travelAssistant/HotelFilteredOutSheet";
import { HotelRefineSheet } from "@/components/travelAssistant/HotelRefineSheet";
import { computeLivePriceBounds, resolveHotelDisplay } from "@/lib/hotels/hotelSearchFilters";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import { hotelParticipatesInPoints, HOTEL_CHAINS, matchHotelChain, type HotelChainId } from "@/lib/loyalty/chainRegistry";

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

export function TripHotelSearch({
  defaultCity = "",
  defaultCityIata = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  onAddHotel,
  onSavedToTrip,
}: TripHotelSearchProps) {
  const {
    city,
    cityIata,
    checkIn,
    checkOut,
    setCheckIn,
    setCheckOut,
    setCityField,
    clearCityField,
  } = useHotelSearchFields({
    city: defaultCity,
    cityIata: defaultCityIata,
    checkIn: defaultCheckIn,
    checkOut: defaultCheckOut,
  });
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
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [liveBookableCount, setLiveBookableCount] = useState(0);
  const [googleHotelsUrl, setGoogleHotelsUrl] = useState<string | null>(null);
  const [inCityCount, setInCityCount] = useState(0);
  const [resultsView, setResultsView] = useState<ResultsView>("list");
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const [detailHotelId, setDetailHotelId] = useState<string | null>(null);
  const [savedHotelIds, setSavedHotelIds] = useState<Set<string>>(new Set());
  const [hotelsWithCoords, setHotelsWithCoords] = useState<Array<RankedHotelSearchResult & { lat: number; lng: number }>>([]);
  const [learningNote, setLearningNote] = useState<string | null>(null);
  const [memberHotelPricing, setMemberHotelPricing] = useState(false);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [chainToggles, setChainToggles] = useState<ChainToggleMap<HotelChainId>>(() => loadHotelChainToggles());
  const [stayProfile, setStayProfile] = useState<HotelStayProfile | null>(null);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(500);
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 500, hasLiveRates: false });
  const [refineOpen, setRefineOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [strictStyleFilter, setStrictStyleFilter] = useState(false);
  const autoSearchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void fetch("/api/hotels/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { profile?: HotelStayProfile } | null) => {
        if (payload?.profile) setStayProfile(payload.profile);
      })
      .catch(() => {});
  }, []);

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
    setStrictStyleFilter(false);
    setShowResults(true);

    try {
      const response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, checkIn, checkOut, guests, rooms }),
      });
      const rawBody = await response.text();
      let payload: {
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
        memberHotelPricing?: boolean;
        source?: string;
        notice?: string | null;
        liveBookableCount?: number;
        resolved?: { lat: number; lng: number; iata?: string | null };
      } = {};
      try {
        payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
      } catch {
        setError(
          response.ok
            ? "Hotel search returned an unexpected response."
            : `Hotel search failed (${response.status}). Try again.`,
        );
        return;
      }
      if (!response.ok) {
        setError(payload.error ?? payload.detail?.errors?.[0]?.message ?? "Hotel search failed.");
        setErrorSuggestions(payload.suggestions ?? []);
        return;
      }

      let hotels = payload.hotels ?? [];
      if (payload.resolved?.lat && payload.resolved?.lng) {
        hotels = filterHotelsWithinRenderDistance(hotels, {
          lat: payload.resolved.lat,
          lng: payload.resolved.lng,
        });
      }

      setResults(hotels);
      const bounds = computeLivePriceBounds(hotels);
      setPriceBounds(bounds);
      setPriceMin(bounds.min);
      setPriceMax(bounds.max);
      setResolvedCity(payload.city ?? destination);
      setCorrectedFrom(payload.correctedFrom ?? null);
      setPreferenceInsight(payload.preferenceInsight ?? null);
      setInventoryNote(payload.inventoryNote ?? null);
      setSearchSource(payload.source ?? null);
      setProviderNotice(payload.notice ?? null);
      setLiveBookableCount(payload.liveBookableCount ?? 0);
      setGoogleHotelsUrl(payload.googleHotelsUrl ?? null);
      setInCityCount(payload.inCityCount ?? 0);
      setMemberHotelPricing(Boolean(payload.memberHotelPricing));
      setShowNearby(false);
      setSortMode("browse");
      if (payload.resolved?.lat && payload.resolved?.lng) {
        setCityCenter({ lat: payload.resolved.lat, lng: payload.resolved.lng });
        setHotelsWithCoords(
          attachHotelCoordinates(
            hotels,
            payload.resolved.lat,
            payload.resolved.lng,
            payload.city ?? resolvedCity ?? city,
          ),
        );
      } else if (hotels.length > 0) {
        setCityCenter(null);
        setHotelsWithCoords([]);
      } else {
        setCityCenter(null);
        setHotelsWithCoords([]);
      }
      setLearningNote(null);
      setResultsView("list");
      setMapSelectedId(hotels[0]?.id ?? null);
      setDetailHotelId(null);
      if (hotels.length === 0) {
        setError(payload.error ?? `No hotels found near ${payload.city ?? destination}.`);
      }
      if (!payload.resolved?.lat && payload.city) {
        setError((prev) => prev ?? `Could not place ${payload.city} on the map. Try an airport code (e.g. MUC).`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection error";
      setError(message.includes("fetch") || message.includes("network")
        ? "Connection error — try again."
        : `Hotel search failed — ${message}`);
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

  const enabledChains = useMemo(() => {
    const ids = enabledHotelChainIds(chainToggles);
    return new Set(ids.length > 0 ? ids : HOTEL_CHAINS.map((chain) => chain.id));
  }, [chainToggles]);

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
      rows.sort((a, b) => {
        const aPts = a.pointsOption?.milesNeeded ?? Number.POSITIVE_INFINITY;
        const bPts = b.pointsOption?.milesNeeded ?? Number.POSITIVE_INFINITY;
        if (aPts !== bPts) return aPts - bPts;
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

  const displayResult = useMemo(
    () =>
      resolveHotelDisplay(chainFilteredResults, {
        profile: stayProfile,
        priceMin,
        priceMax,
        catalogBounds: priceBounds,
        strictStyleFilter,
      }),
    [chainFilteredResults, stayProfile, priceMin, priceMax, priceBounds, strictStyleFilter],
  );

  const visibleResults = displayResult.visible;
  const hiddenRows: FilteredHotelRow[] = displayResult.hidden;
  const relaxedNote = displayResult.relaxedNote;

  const featuredHotels = useMemo(() => pickFeaturedHotels(visibleResults, 3), [visibleResults]);
  const featuredIds = useMemo(() => new Set(featuredHotels.map((h) => h.id)), [featuredHotels]);
  const remainingHotels = useMemo(
    () => visibleResults.filter((hotel) => !featuredIds.has(hotel.id)),
    [visibleResults, featuredIds],
  );

  const mappedHotels = useMemo(() => {
    if (hotelsWithCoords.length > 0) {
      const visibleIds = new Set(visibleResults.map((row) => row.id));
      return hotelsWithCoords.filter((row) => visibleIds.has(row.id));
    }
    if (!cityCenter) return [];
    return attachHotelCoordinates(visibleResults, cityCenter.lat, cityCenter.lng, resolvedCity ?? city);
  }, [cityCenter, hotelsWithCoords, visibleResults, resolvedCity, city]);

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
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">{error}</p>
        {errorSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {errorSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => applyDestinationSuggestion(suggestion)}
                className="rounded-full bg-[#f4c95d] px-4 py-2 text-sm font-semibold text-[#0b1f3a]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const nearbyCount = Math.max(0, results.length - inCityCount);

  return (
    <div className="space-y-4">
      {!showResults ? (
        <>
          <HotelCityField
            label="City or destination"
            value={city}
            cityIata={cityIata}
            onChange={setCityField}
            onClear={clearCityField}
            placeholder="e.g. Munich, Rome, New York"
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <button type="button" disabled={loading} onClick={() => void runSearch()} className={`${SEARCH_PRIMARY_BUTTON} bg-[#0b1f3a] text-[#f4c95d] disabled:opacity-60`}>
            {loading ? "Searching…" : "Search hotels"}
          </button>
        </>
      ) : (
        <div className="rounded-3xl bg-[#fafafa] p-4 dark:bg-[#0b1f3a] md:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">{resolvedCity ?? city}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {checkIn} → {checkOut} · {visibleResults.length} hotel{visibleResults.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefineOpen(true)}
                className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
              >
                Refine
              </button>
              <button
                type="button"
                onClick={() => setResultsView((view) => (view === "map" ? "list" : "map"))}
                className="rounded-full bg-[#f4c95d] px-4 py-2 text-sm font-bold text-[#0b1f3a]"
              >
                {resultsView === "map" ? "List" : "Map"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResults(false);
                  setError(null);
                }}
                className="rounded-full px-3 py-2 text-sm text-slate-500"
              >
                Edit
              </button>
            </div>
          </div>

          {correctedFrom ? (
            <p className="mb-4 text-sm text-slate-500">
              Showing hotels near <strong>{resolvedCity}</strong> (corrected from &ldquo;{correctedFrom}&rdquo;).
            </p>
          ) : null}

          {searchSource === "liteapi" || providerNotice ? (
            <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/40">
              <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                {liveBookableCount > 0
                  ? `${liveBookableCount} hotel${liveBookableCount === 1 ? "" : "s"} ready to book in Kepi`
                  : "Live hotel rates via LiteAPI"}
              </p>
              <p className="mt-1 text-sm text-sky-800 dark:text-sky-200">
                {providerNotice ??
                  "Tap a hotel → Book with Kepi → pay with Stripe. Your confirmation saves to the trip automatically."}
              </p>
            </div>
          ) : null}

          {relaxedNote ? (
            <p className="mb-4 text-sm text-slate-500">{relaxedNote}</p>
          ) : null}

          {(preferenceInsight || learningNote) && !inventoryNote ? (
            <p className="mb-4 text-sm text-slate-500">{learningNote ?? preferenceInsight}</p>
          ) : null}

          {savedHotelIds.size > 0 ? (
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              {savedHotelIds.size} saved to your trip — keep comparing or pick another.
            </p>
          ) : null}

          {inventoryNote ? (
            <div className="mb-4 space-y-2 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900/50">
              <p className="text-sm text-slate-600 dark:text-slate-300">{inventoryNote}</p>
              {googleHotelsUrl ? (
                <a href={googleHotelsUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#0b1f3a] underline dark:text-[#f4c95d]">
                  Browse all on Google →
                </a>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((key) => (
                <div key={key} className="h-64 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
              ))}
            </div>
          ) : null}

          {!loading ? renderErrorWithSuggestions() : null}

          {!loading && visibleResults.length > 0 ? (
            <>
              <div className="space-y-4">
                {featuredHotels.map((hotel) => (
                  <HotelRankCard
                    key={hotel.id}
                    hotel={hotel}
                    totalInSearch={results.length}
                    premium
                    payMode={payMode}
                    onAdd={() => openDetail(hotel)}
                  />
                ))}
              </div>

              {resultsView === "map" && cityCenter ? (
                <div className="mt-6">
                  <HotelStayMap
                    city={resolvedCity ?? city}
                    centerLat={cityCenter.lat}
                    centerLng={cityCenter.lng}
                    hotels={mappedHotels}
                    selectedId={mapSelectedId}
                    onSelect={openDetail}
                    payMode={payMode}
                    expanded
                    priceMin={priceMin}
                    priceMax={priceMax}
                    priceBounds={{ min: priceBounds.min, max: priceBounds.max }}
                    onPriceRangeChange={(min, max) => {
                      setPriceMin(min);
                      setPriceMax(max);
                    }}
                    onOpenPreferences={() => setRefineOpen(true)}
                  />
                </div>
              ) : null}

              {resultsView === "list" && remainingHotels.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">More options</p>
                  {remainingHotels.map((hotel) => (
                    <HotelRankCard
                      key={hotel.id}
                      hotel={hotel}
                      totalInSearch={results.length}
                      compact
                      payMode={payMode}
                      selected={detailHotelId === hotel.id}
                      onSelect={() => openDetail(hotel)}
                      onAdd={() => openDetail(hotel)}
                    />
                  ))}
                </div>
              ) : null}

              {hiddenRows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setHiddenOpen(true)}
                  className="mt-4 text-sm text-slate-500 underline"
                >
                  {hiddenRows.length} filtered — see why
                </button>
              ) : null}
            </>
          ) : null}

          {!loading && visibleResults.length === 0 && results.length > 0 ? (
            <p className="text-sm text-slate-500">
              {payMode === "points"
                ? "No Hyatt, Marriott, Hilton, or IHG hotels in this search for your dates — try Cash + points or open Refine to widen chains."
                : "No hotels match your filters — open Refine to adjust."}
            </p>
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

          <HotelRefineSheet
            open={refineOpen}
            onClose={() => setRefineOpen(false)}
            payMode={payMode}
            onPayModeChange={setPayMode}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            showNearby={showNearby}
            onShowNearbyChange={setShowNearby}
            nearbyCount={nearbyCount}
            chainToggles={chainToggles}
            onChainToggle={handleChainToggle}
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
            onApplyStrictStyle={() => setStrictStyleFilter(true)}
          />

          <HotelFilteredOutSheet
            open={hiddenOpen}
            onClose={() => setHiddenOpen(false)}
            rows={hiddenRows}
            onAdjustPreferences={() => setRefineOpen(true)}
          />
        </div>
      )}
    </div>
  );
}
