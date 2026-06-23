"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  stops: number;
  duration: string;
  returnFlight: {
    departs: string;
    arrives: string;
    stops: number;
    duration: string;
  } | null;
}

function fmt(iso: string) {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDuration(dur: string) {
  if (!dur) return "";
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return dur;
  const h = m[1] ?? "0", min = m[2] ?? "0";
  return `${h}h ${min}m`;
}

function FlightCard({ flight, onSelect }: { flight: Flight; onSelect: () => void }) {
  const stops = flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  return (
    <div className="rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{flight.airline} · {flight.airlineName}</span>
          <span className="text-2xl font-black text-white">${Math.round(flight.price).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xl font-bold text-white">{fmt(flight.departs)}</p>
            <p className="text-xs text-slate-400">{flight.fromIata}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-500">{fmtDuration(flight.duration)}</p>
            <div className="flex items-center gap-1 my-1">
              <div className="h-px flex-1 bg-slate-600" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <div className="h-px flex-1 bg-slate-600" />
            </div>
            <p className="text-xs text-slate-400">{stops}</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">{fmt(flight.arrives)}</p>
            <p className="text-xs text-slate-400">{flight.toIata}</p>
          </div>
        </div>
        {flight.returnFlight && (
          <div className="mt-3 pt-3 border-t border-slate-700/60">
            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Return · {fmtDate(flight.returnFlight.departs)}</p>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-slate-300">{fmt(flight.returnFlight.departs)}</p>
              <p className="flex-1 text-center text-xs text-slate-500">{fmtDuration(flight.returnFlight.duration)} · {flight.returnFlight.stops === 0 ? "Nonstop" : `${flight.returnFlight.stops} stop`}</p>
              <p className="text-sm font-semibold text-slate-300">{fmt(flight.returnFlight.arrives)}</p>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="w-full py-3 bg-[#f4c95d] text-[#0b1f3a] font-black text-sm active:opacity-80"
      >
        Select this flight →
      </button>
    </div>
  );
}

export default function BookPage() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [depart, setDepart] = useState("");
  const [returnD, setReturnD] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState("economy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Flight | null>(null);

  const search = async () => {
    if (!from.trim() || !to.trim() || !depart) {
      setError("Please fill in From, To, and Departure date.");
      return;
    }
    setLoading(true);
    setError(null);
    setFlights([]);
    setSearched(false);
    setSelected(null);

    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: from.trim(),
          destination: to.trim(),
          departDate: depart,
          returnDate: returnD || undefined,
          passengers,
          cabin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed — please try again.");
        return;
      }
      setFlights(data.flights ?? []);
      setTotal(data.total ?? 0);
      setSearched(true);
      if ((data.flights ?? []).length === 0) {
        setError("No flights found for this route and date. Try different dates or a nearby airport.");
      }
    } catch {
      setError("Connection error — check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    return (
      <div className="min-h-screen bg-[#0b1f3a] px-4 py-8 max-w-lg mx-auto">
        <button type="button" onClick={() => setSelected(null)} className="mb-6 text-sm text-slate-400 flex items-center gap-1">
          ← Back to results
        </button>
        <h1 className="text-2xl font-black text-white mb-2">Your flight</h1>
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-400">{selected.fromIata} → {selected.toIata}</p>
              <p className="text-lg font-bold text-white">{fmtDate(selected.departs)}</p>
            </div>
            <p className="text-3xl font-black text-[#f4c95d]">${Math.round(selected.price)}</p>
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            <p>{selected.airline} · {selected.airlineName}</p>
            <p>{fmt(selected.departs)} → {fmt(selected.arrives)} ({fmtDuration(selected.duration)})</p>
            <p>{selected.stops === 0 ? "✓ Nonstop" : `${selected.stops} stop${selected.stops > 1 ? "s" : ""}`}</p>
          </div>
          {selected.returnFlight && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 uppercase font-bold mb-2">Return · {fmtDate(selected.returnFlight.departs)}</p>
              <div className="text-sm text-slate-300 space-y-1">
                <p>{fmt(selected.returnFlight.departs)} → {fmt(selected.returnFlight.arrives)} ({fmtDuration(selected.returnFlight.duration)})</p>
                <p>{selected.returnFlight.stops === 0 ? "✓ Nonstop" : `${selected.returnFlight.stops} stop${selected.returnFlight.stops > 1 ? "s" : ""}`}</p>
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Price shown is from Duffel and includes all taxes and fees. Final price confirmed at checkout.
        </p>
        <button
          type="button"
          onClick={() => router.push("/travel-assistant")}
          className="w-full py-4 bg-[#f4c95d] text-[#0b1f3a] font-black text-base rounded-2xl active:opacity-80 mb-3"
        >
          Save to my trips →
        </button>
        <button type="button" onClick={() => setSelected(null)} className="w-full py-3 text-slate-400 text-sm">
          See other options
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Kepi Travel</p>
          <h1 className="text-xl font-black text-white">Find Flights</h1>
        </div>
        <Link href="/travel-assistant" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">
          My trips →
        </Link>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Search form */}
        <div className="space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">From</label>
              <input
                type="text"
                value={from}
                onChange={e => setFrom(e.target.value)}
                placeholder="City or airport"
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-[#f4c95d]/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">To</label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="City or airport"
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-[#f4c95d]/60 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Depart</label>
              <input
                type="date"
                value={depart}
                onChange={e => setDepart(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white focus:border-[#f4c95d]/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Return <span className="text-slate-500 normal-case font-normal">(optional)</span></label>
              <input
                type="date"
                value={returnD}
                onChange={e => setReturnD(e.target.value)}
                min={depart || new Date().toISOString().split("T")[0]}
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white focus:border-[#f4c95d]/60 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Passengers</label>
              <select
                value={passengers}
                onChange={e => setPassengers(Number(e.target.value))}
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white focus:outline-none"
              >
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? "adult" : "adults"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Cabin</label>
              <select
                value={cabin}
                onChange={e => setCabin(e.target.value)}
                className="w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white focus:outline-none"
              >
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium Eco</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={search}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base disabled:opacity-60 active:opacity-80 mb-6"
        >
          {loading ? "Searching flights…" : "Search flights"}
        </button>

        {error && (
          <div className="rounded-2xl bg-red-900/30 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {searched && flights.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-3">{total} flights found · showing cheapest {flights.length}</p>
            <div className="space-y-3">
              {flights.map(f => (
                <FlightCard key={f.id} flight={f} onSelect={() => setSelected(f)} />
              ))}
            </div>
          </div>
        )}

        {!searched && !loading && (
          <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-8 text-center">
            <p className="text-2xl mb-2">✈️</p>
            <p className="text-white font-bold">Where are you going?</p>
            <p className="text-sm text-slate-400 mt-1">Enter your origin and destination above to see real flights and prices.</p>
            <div className="mt-4 space-y-2 text-left">
              {["LAX → BRI", "ONT → JFK", "SNA → MUC"].map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    const [o, d] = ex.split(" → ");
                    setFrom(o ?? "");
                    setTo(d ?? "");
                  }}
                  className="block w-full text-left rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-300"
                >
                  → {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
