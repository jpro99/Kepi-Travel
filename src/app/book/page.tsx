"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { suggestAirports, resolveAirport, type AirportResult } from "@/lib/airports/lookup";
import { CheckoutFlow } from "@/components/booking/CheckoutFlow";
import { calcTrueCost, calcPointsOptions, type LoyaltyBalance } from "@/lib/loyalty/optimizer";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Flight {
  id: string;
  price: number;
  currency: string;
  airline: string;
  airlineName: string;
  departs: string;
  arrives: string;
  fromIata: string;
  toIata: string;
  fromCity: string;
  toCity: string;
  stops: number;
  duration: string;
  segments: FlightSegment[];
  returnFlight: {
    departs: string;
    arrives: string;
    stops: number;
    duration: string;
    segments: FlightSegment[];
    fromIata: string;
    toIata: string;
  } | null;
}

interface FlightSegment {
  airline: string;
  flightNumber: string;
  fromIata: string;
  toIata: string;
  departs: string;
  arrives: string;
  duration: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt12(iso: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtDur(dur: string) {
  if (!dur) return "";
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return dur;
  return `${m[1] ?? 0}h ${m[2] ?? 0}m`;
}
function stopsLabel(n: number) {
  return n === 0 ? "Nonstop" : n === 1 ? "1 stop" : `${n} stops`;
}
function durationMins(dur: string) {
  const m = dur?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 9999;
  return (Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
}

// ─── Airport Input ─────────────────────────────────────────────────────────────
function AirportInput({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (val: string, iata: string) => void;
  placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val: string) => {
    onChange(val, "");
    const suggestions = suggestAirports(val);
    setSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0);
  };

  const handleSelect = (airport: AirportResult) => {
    onChange(`${airport.city} (${airport.iata})`, airport.iata);
    setShowSuggestions(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => value.length >= 2 && setSuggestions(suggestAirports(value)) && setShowSuggestions(true)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white placeholder:text-slate-500 focus:border-[#f4c95d]/60 focus:outline-none"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
          {suggestions.map(a => (
            <button
              key={a.iata}
              type="button"
              onMouseDown={() => handleSelect(a)}
              onTouchEnd={() => handleSelect(a)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 active:bg-slate-700 border-b border-slate-800 last:border-0"
            >
              <span className="text-xs font-black text-[#f4c95d] w-9 shrink-0">{a.iata}</span>
              <span>
                <p className="text-sm font-semibold text-white">{a.city}</p>
                <p className="text-xs text-slate-400">{a.name}</p>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Flight Card ──────────────────────────────────────────────────────────────
function FlightCard({ flight, onSelect }: { flight: Flight; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden active:scale-[0.99] transition-transform"
    >
      <div className="px-4 py-4">
        {/* Airline + price row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs font-bold text-slate-300">{flight.airline}</span>
            {flight.airlineName && <span className="text-xs text-slate-500"> · {flight.airlineName}</span>}
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-white">${Math.round(flight.price).toLocaleString()}</span>
            <p className="text-[10px] text-slate-500">per person</p>
          </div>
        </div>

        {/* Outbound flight times */}
        <div className="flex items-center gap-2 mb-1">
          <div className="text-center w-16">
            <p className="text-lg font-bold text-white">{fmt12(flight.departs)}</p>
            <p className="text-xs text-slate-400">{flight.fromIata}</p>
          </div>
          <div className="flex-1 flex flex-col items-center gap-0.5">
            <p className="text-[10px] text-slate-500">{fmtDur(flight.duration)}</p>
            <div className="w-full flex items-center gap-1">
              <div className="h-px flex-1 bg-slate-600" />
              {flight.stops > 0 && <div className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />}
              <div className="h-px flex-1 bg-slate-600" />
              <div className="w-1.5 h-1.5 rounded-full border border-slate-500 shrink-0" />
            </div>
            <p className="text-[10px] font-medium text-slate-400">{stopsLabel(flight.stops)}</p>
          </div>
          <div className="text-center w-16">
            <p className="text-lg font-bold text-white">{fmt12(flight.arrives)}</p>
            <p className="text-xs text-slate-400">{flight.toIata}</p>
          </div>
        </div>

        {/* Return leg */}
        {flight.returnFlight && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <p className="text-[10px] text-[#f4c95d] font-bold uppercase mb-1.5">Return · {fmtDate(flight.returnFlight.departs)}</p>
            <div className="flex items-center gap-2">
              <div className="text-center w-16">
                <p className="text-sm font-bold text-white">{fmt12(flight.returnFlight.departs)}</p>
                <p className="text-[10px] text-slate-400">{flight.returnFlight.fromIata}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[10px] text-slate-500">{fmtDur(flight.returnFlight.duration)} · {stopsLabel(flight.returnFlight.stops)}</p>
              </div>
              <div className="text-center w-16">
                <p className="text-sm font-bold text-white">{fmt12(flight.returnFlight.arrives)}</p>
                <p className="text-[10px] text-slate-400">{flight.returnFlight.toIata}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="bg-[#f4c95d] px-4 py-3 text-center font-black text-sm text-[#0b1f3a]">
        Select →
      </div>
    </button>
  );
}

// ─── Flight Detail ─────────────────────────────────────────────────────────────
function FlightDetail({ flight, onBack, onSave }: { flight: Flight; onBack: () => void; onSave: () => void }) {
  const SegmentRow = ({ seg }: { seg: FlightSegment }) => (
    <div className="flex items-start gap-3 py-3">
      <div className="w-12 text-center shrink-0">
        <p className="text-xs font-black text-[#f4c95d]">{seg.airline}</p>
        <p className="text-[10px] text-slate-500">{seg.flightNumber}</p>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{fmt12(seg.departs)}</p>
            <p className="text-xs text-slate-400">{seg.fromIata}</p>
          </div>
          <div className="text-center text-xs text-slate-500 px-2">{fmtDur(seg.duration)}</div>
          <div className="text-right">
            <p className="text-sm font-bold text-white">{fmt12(seg.arrives)}</p>
            <p className="text-xs text-slate-400">{seg.toIata}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
        <button type="button" onClick={onBack} className="text-slate-400 text-sm">← Back</button>
        <h1 className="text-base font-black text-white">Flight details</h1>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* Price */}
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Total price</p>
            <p className="text-3xl font-black text-white">${Math.round(flight.price).toLocaleString()}</p>
            <p className="text-xs text-slate-500">includes taxes &amp; fees</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-300">{flight.airline}</p>
            <p className="text-xs text-slate-500">{flight.airlineName}</p>
          </div>
        </div>

        {/* Outbound */}
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4">
          <p className="pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">
            Outbound · {fmtDate(flight.departs)}
          </p>
          {flight.segments.map((seg, i) => (
            <div key={i}>
              <SegmentRow seg={seg} />
              {i < flight.segments.length - 1 && (
                <p className="text-[10px] text-slate-500 text-center py-2 border-t border-slate-700/40">· Layover ·</p>
              )}
            </div>
          ))}
          <div className="pb-3" />
        </div>

        {/* Return */}
        {flight.returnFlight && (
          <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4">
            <p className="pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">
              Return · {fmtDate(flight.returnFlight.departs)}
            </p>
            {flight.returnFlight.segments.map((seg, i) => (
              <div key={i}>
                <SegmentRow seg={seg} />
                {i < flight.returnFlight!.segments.length - 1 && (
                  <p className="text-[10px] text-slate-500 text-center py-2 border-t border-slate-700/40">· Layover ·</p>
                )}
              </div>
            ))}
            <div className="pb-3" />
          </div>
        )}

        {/* True cost breakdown */}
        {(() => {
          const trueCost = calcTrueCost(flight.price, flight.airline, "economy", flight.fromIata, !!flight.returnFlight);
          const pointsOpts = calcPointsOptions(flight.price, flight.airline, loyaltyBalances);
          const bestPoints = pointsOpts.find(o => o.type === "points" && o.recommendation === "use");
          return (
            <div className="space-y-3">
              {/* True cost */}
              <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">True trip cost</p>
                <div className="space-y-2">
                  {trueCost.breakdown.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-400">{item.label}</span>
                      <span className="text-white font-semibold">
                        {item.note ?? `$${item.amount}`}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-slate-700 text-sm font-black">
                    <span className="text-white">Total real cost</span>
                    <span className="text-[#f4c95d] text-lg">${trueCost.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Points options */}
              {pointsOpts.length > 1 && (
                <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Pay with points?</p>
                  <div className="space-y-2.5">
                    {pointsOpts.map((opt, i) => (
                      <div key={i} className={`rounded-xl px-3 py-2.5 border ${opt.recommendation === "use" ? "border-emerald-500/40 bg-emerald-950/20" : "border-slate-700/50"}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-bold text-white">{opt.label}</span>
                          {opt.recommendation === "use" && <span className="text-[10px] font-black text-emerald-400 uppercase">Best value</span>}
                        </div>
                        <p className="text-xs text-slate-400">{opt.reason}</p>
                        {opt.milesUsed && (
                          <p className="text-xs text-slate-300 mt-1 font-semibold">{opt.milesUsed.toLocaleString()} points</p>
                        )}
                      </div>
                    ))}
                    {loyaltyBalances.length === 0 && (
                      <p className="text-xs text-slate-500">
                        <Link href="/travel-assistant?tab=more" className="text-[#f4c95d] underline">Add your loyalty programs</Link> to see points options here.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {bestPoints && (
                <p className="text-xs text-emerald-400 text-center">
                  💡 You can cover this flight with points — saving ${Math.round(flight.price)} cash
                </p>
              )}
            </div>
          );
        })()}

        

        <button
          type="button"
          onClick={onSave}
          className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base active:opacity-80"
        >
          Book this flight →
        </button>
        <button
          type="button"
          onClick={() => window.location.href = "/travel-assistant"}
          className="w-full py-3 rounded-2xl border border-slate-600 text-slate-300 text-sm font-semibold"
        >
          Save to my trips (without booking)
        </button>
        <button type="button" onClick={onBack} className="w-full py-3 text-slate-400 text-sm text-center">
          See other flights
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-2xl border border-slate-700 bg-[#111e33] p-4 animate-pulse">
          <div className="flex justify-between mb-3">
            <div className="h-3 w-24 bg-slate-700 rounded" />
            <div className="h-7 w-16 bg-slate-700 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-5 w-14 bg-slate-700 rounded" />
            <div className="h-px flex-1 bg-slate-700" />
            <div className="h-5 w-14 bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type SortKey = "price" | "duration" | "stops";
type Screen = "search" | "results" | "detail";

export default function BookPage() {
  const [screen, setScreen] = useState<Screen>("search");
  const [tripType, setTripType] = useState<"oneway" | "roundtrip">("roundtrip");
  const [fromDisplay, setFromDisplay] = useState("");
  const [fromIata, setFromIata] = useState("");
  const [toDisplay, setToDisplay] = useState("");
  const [toIata, setToIata] = useState("");
  const [depart, setDepart] = useState("");
  const [returnD, setReturnD] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState("economy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortKey>("price");
  const [selected, setSelected] = useState<Flight | null>(null);
  const [saved, setSaved] = useState(false);
  const [inCheckout, setInCheckout] = useState(false);
  const [loyaltyBalances, setLoyaltyBalances] = useState<LoyaltyBalance[]>([]);

  // Search filters
  const [filterNonstop, setFilterNonstop] = useState(false);
  const [filterMaxPrice, setFilterMaxPrice] = useState<number | null>(null);
  const [filterAirline, setFilterAirline] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [priceCalendar, setPriceCalendar] = useState<Record<string, number>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Load loyalty balances on mount
  useEffect(() => {
    fetch("/api/loyalty").then(r => r.json()).then(d => {
      if (d.balances) setLoyaltyBalances(d.balances);
    }).catch(() => {});
  }, []);

  const swap = () => {
    setFromDisplay(toDisplay); setFromIata(toIata);
    setToDisplay(fromDisplay); setToIata(fromIata);
  };

  const resolveIata = useCallback((display: string, known: string): string => {
    if (known) return known;
    const r = resolveAirport(display);
    return r?.iata ?? display.trim().toUpperCase().slice(0, 3);
  }, []);

  const search = async () => {
    setError(null);
    const origin = resolveIata(fromDisplay, fromIata);
    const destination = resolveIata(toDisplay, toIata);

    if (!fromDisplay.trim()) { setError("Please enter where you're flying from."); return; }
    if (!toDisplay.trim()) { setError("Please enter where you're flying to."); return; }
    if (!depart) { setError("Please select a departure date."); return; }
    if (tripType === "roundtrip" && !returnD) { setError("Please select a return date for your round trip."); return; }

    setLoading(true);
    setFlights([]);
    setScreen("results");

    // Load price calendar in background
    if (resolveIata(fromDisplay, fromIata) && resolveIata(toDisplay, toIata) && depart) {
      setCalendarLoading(true);
      fetch(`/api/flights/search?origin=${resolveIata(fromDisplay, fromIata)}&destination=${resolveIata(toDisplay, toIata)}&departDate=${depart}`)
        .then(r => r.json())
        .then(d => { if (d.prices) setPriceCalendar(d.prices); })
        .catch(() => {})
        .finally(() => setCalendarLoading(false));
    }

    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          departDate: depart,
          returnDate: tripType === "roundtrip" ? returnD : undefined,
          passengers,
          cabin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed. Please try again.");
        setLoading(false);
        return;
      }
      setFlights(data.flights ?? []);
      setTotal(data.total ?? 0);
      if ((data.flights ?? []).length === 0) {
        setError(`No flights found from ${origin} to ${destination} on ${depart}. Try different dates or nearby airports.`);
      }
    } catch {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = flights
    .filter(f => !filterNonstop || f.stops === 0)
    .filter(f => !filterMaxPrice || f.price <= filterMaxPrice)
    .filter(f => !filterAirline || f.airline === filterAirline);

  const uniqueAirlines = [...new Set(flights.map(f => f.airline))];
  const maxFlightPrice = flights.length ? Math.max(...flights.map(f => f.price)) : 0;
  const minFlightPrice = flights.length ? Math.min(...flights.map(f => f.price)) : 0;

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "price") return a.price - b.price;
    if (sort === "duration") return durationMins(a.duration) - durationMins(b.duration);
    if (sort === "stops") return a.stops - b.stops;
    return 0;
  });

  const handleSave = async () => {
    setInCheckout(true);
  };

  if (inCheckout && selected) {
    return (
      <CheckoutFlow
        flight={selected}
        passengers={passengers}
        onCancel={() => setInCheckout(false)}
        onComplete={(ref) => {
          setSaved(true);
          setInCheckout(false);
        }}
      />
    );
  }

  // ── Detail screen ────────────────────────────────────────────────────────
  if (screen === "detail" && selected) {
    if (saved) {
      return (
        <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
          <p className="text-5xl mb-4">✈️</p>
          <h2 className="text-2xl font-black text-white mb-2">Trip saved!</h2>
          <p className="text-slate-400 text-sm mb-8">Your {selected.fromIata} → {selected.toIata} flight is in your Kepi trips.</p>
          <Link href="/travel-assistant" className="w-full max-w-xs py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base text-center block">
            View my trips →
          </Link>
          <button type="button" onClick={() => { setSaved(false); setScreen("search"); }} className="mt-4 text-slate-400 text-sm">
            Search another flight
          </button>
        </div>
      );
    }
    return <FlightDetail flight={selected} onBack={() => setScreen("results")} onSave={handleSave} />;
  }

  // ── Results screen ─────────────────────────────────────────────────────────
  if (screen === "results") {
    return (
      <div className="min-h-screen bg-[#0b1f3a]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
          <button type="button" onClick={() => { setScreen("search"); setError(null); }} className="text-slate-400 text-sm shrink-0">← Edit</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">
              {resolveIata(fromDisplay, fromIata)} → {resolveIata(toDisplay, toIata)}
            </p>
            <p className="text-xs text-slate-400">{fmtDate(depart)}{returnD ? ` · Return ${fmtDate(returnD)}` : " · One way"} · {passengers} {passengers === 1 ? "adult" : "adults"}</p>
          </div>
        </div>

        <div className="px-4 py-4 max-w-lg mx-auto">
          {/* Price calendar — cheapest day ±3 days */}
          {(Object.keys(priceCalendar).length > 0 || calendarLoading) && !loading && (
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Prices nearby dates</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {Object.entries(priceCalendar)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, price]) => {
                    const isSelected = date === depart;
                    const cheapest = Math.min(...Object.values(priceCalendar));
                    const isCheapest = price === cheapest;
                    const d = new Date(date);
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => { setDepart(date); void search(); }}
                        className={`shrink-0 rounded-xl px-3 py-2 text-center transition ${
                          isSelected ? "bg-[#f4c95d] text-[#0b1f3a]" :
                          isCheapest ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300" :
                          "bg-slate-800 border border-slate-700 text-slate-300"
                        }`}
                      >
                        <p className="text-[10px] font-bold">
                          {d.toLocaleDateString("en-US", { weekday: "short" })}
                        </p>
                        <p className="text-[10px]">{d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</p>
                        <p className={`text-xs font-black mt-0.5 ${isCheapest && !isSelected ? "text-emerald-400" : ""}`}>
                          ${Math.round(price)}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Sort + Filter bar */}
          {!loading && flights.length > 0 && (
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400 shrink-0">Sort:</p>
                {(["price", "duration", "stops"] as SortKey[]).map(key => (
                  <button key={key} type="button" onClick={() => setSort(key)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${sort === key ? "bg-[#f4c95d] text-[#0b1f3a]" : "border border-slate-600 text-slate-400"}`}>
                    {key === "price" ? "Cheapest" : key === "duration" ? "Fastest" : "Fewest stops"}
                  </button>
                ))}
                <button type="button" onClick={() => setShowFilters(!showFilters)}
                  className={`ml-auto rounded-xl px-3 py-1.5 text-xs font-bold border ${showFilters ? "border-[#f4c95d]/60 text-[#f4c95d]" : "border-slate-600 text-slate-400"}`}>
                  Filter {(filterNonstop || filterMaxPrice || filterAirline) ? "•" : ""}
                </button>
              </div>

              {showFilters && (
                <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4 space-y-3">
                  {/* Nonstop toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-white font-semibold">Nonstop only</label>
                    <button type="button" onClick={() => setFilterNonstop(!filterNonstop)}
                      className={`w-11 h-6 rounded-full transition relative ${filterNonstop ? "bg-[#f4c95d]" : "bg-slate-600"}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${filterNonstop ? "left-6" : "left-1"}`} />
                    </button>
                  </div>

                  {/* Airline filter */}
                  {uniqueAirlines.length > 1 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Airline</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setFilterAirline(null)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-bold border ${!filterAirline ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
                          All
                        </button>
                        {uniqueAirlines.map(a => (
                          <button key={a} type="button" onClick={() => setFilterAirline(filterAirline === a ? null : a)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold border ${filterAirline === a ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Max price */}
                  {maxFlightPrice > minFlightPrice && (
                    <div>
                      <div className="flex justify-between mb-2">
                        <p className="text-xs text-slate-400">Max price</p>
                        <p className="text-xs font-bold text-white">{filterMaxPrice ? `$${filterMaxPrice}` : "Any"}</p>
                      </div>
                      <input type="range" min={minFlightPrice} max={maxFlightPrice} step={10}
                        value={filterMaxPrice ?? maxFlightPrice}
                        onChange={e => setFilterMaxPrice(Number(e.target.value) >= maxFlightPrice ? null : Number(e.target.value))}
                        className="w-full accent-[#f4c95d]" />
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                        <span>${Math.round(minFlightPrice)}</span>
                        <span>${Math.round(maxFlightPrice)}</span>
                      </div>
                    </div>
                  )}

                  {(filterNonstop || filterMaxPrice || filterAirline) && (
                    <button type="button" onClick={() => { setFilterNonstop(false); setFilterMaxPrice(null); setFilterAirline(null); }}
                      className="text-xs text-red-400 font-semibold">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-500">
                {filtered.length} of {flights.length} flights shown
              </p>
            </div>
          )}

          {loading && <Skeleton />}

          {error && (
            <div className="rounded-2xl bg-slate-800 border border-slate-700 px-4 py-5 text-center mt-4">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-white font-bold mb-1">No flights found</p>
              <p className="text-sm text-slate-400">{error}</p>
              <button type="button" onClick={() => setScreen("search")} className="mt-4 rounded-xl bg-[#f4c95d] text-[#0b1f3a] font-bold px-5 py-2.5 text-sm">
                Edit search
              </button>
            </div>
          )}

          {!loading && flights.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-3">{total} flights found · showing {flights.length}</p>
              <div className="space-y-3">
                {sorted.map(f => (
                  <FlightCard
                    key={f.id}
                    flight={f}
                    onSelect={() => { setSelected(f); setScreen("detail"); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Search screen (default) ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Kepi Travel</p>
          <h1 className="text-xl font-black text-white">Find flights</h1>
        </div>
        <Link href="/travel-assistant" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">
          My trips →
        </Link>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Trip type toggle */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setTripType("roundtrip")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tripType === "roundtrip" ? "bg-[#f4c95d] text-[#0b1f3a]" : "border border-slate-600 text-slate-400"}`}
          >
            Round trip
          </button>
          <button
            type="button"
            onClick={() => setTripType("oneway")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tripType === "oneway" ? "bg-[#f4c95d] text-[#0b1f3a]" : "border border-slate-600 text-slate-400"}`}
          >
            One way
          </button>
        </div>

        {/* From / Swap / To */}
        <div className="relative mb-4">
          <AirportInput
            label="From"
            value={fromDisplay}
            onChange={(val, iata) => { setFromDisplay(val); setFromIata(iata); }}
            placeholder="City or airport (e.g. Los Angeles)"
          />
          {/* Swap button */}
          <button
            type="button"
            onClick={swap}
            className="absolute right-4 top-1/2 -translate-y-1/2 mt-3 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 active:bg-slate-600"
            aria-label="Swap airports"
          >
            ⇅
          </button>
          <div className="mt-3">
            <AirportInput
              label="To"
              value={toDisplay}
              onChange={(val, iata) => { setToDisplay(val); setToIata(iata); }}
              placeholder="City or airport (e.g. Bari, Italy)"
            />
          </div>
        </div>

        {/* Dates */}
        <div className={`grid gap-3 mb-4 ${tripType === "roundtrip" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Depart</label>
            <input
              type="date"
              value={depart}
              onChange={e => setDepart(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:border-[#f4c95d]/60 focus:outline-none"
            />
          </div>
          {tripType === "roundtrip" && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Return</label>
              <input
                type="date"
                value={returnD}
                onChange={e => setReturnD(e.target.value)}
                min={depart || new Date().toISOString().split("T")[0]}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:border-[#f4c95d]/60 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Passengers + Cabin */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Passengers</label>
            <select
              value={passengers}
              onChange={e => setPassengers(Number(e.target.value))}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none"
            >
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? "adult" : "adults"}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Cabin</label>
            <select
              value={cabin}
              onChange={e => setCabin(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none"
            >
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium Eco</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </div>
        </div>

        {error && screen === "search" && (
          <div className="rounded-2xl bg-red-900/20 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={search}
          className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base active:opacity-80"
        >
          Search flights
        </button>

        {/* Quick picks */}
        <div className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">Popular routes</p>
          <div className="space-y-2">
            {[
              { from: "Los Angeles (LAX)", fIata: "LAX", to: "New York (JFK)", tIata: "JFK" },
              { from: "Ontario / Beaumont (ONT)", fIata: "ONT", to: "Bari, Italy (BRI)", tIata: "BRI" },
              { from: "Los Angeles (LAX)", fIata: "LAX", to: "London (LHR)", tIata: "LHR" },
            ].map(r => (
              <button
                key={r.fIata + r.tIata}
                type="button"
                onClick={() => { setFromDisplay(r.from); setFromIata(r.fIata); setToDisplay(r.to); setToIata(r.tIata); }}
                className="w-full flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 text-left active:bg-slate-800"
              >
                <span className="text-slate-500 text-sm">✈</span>
                <span>
                  <p className="text-sm text-white">{r.fIata} → {r.tIata}</p>
                  <p className="text-xs text-slate-500">{r.from.split("(")[0]?.trim()} → {r.to.split("(")[0]?.trim()}</p>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
