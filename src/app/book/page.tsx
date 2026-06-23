"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { CheckoutFlow } from "@/components/booking/CheckoutFlow";
import { suggestAirports, resolveAirport } from "@/lib/airports/lookup";
import { calcTrueCost, calcPointsOptions, type LoyaltyBalance } from "@/lib/loyalty/optimizer";
import type { AirportResult } from "@/lib/airports/lookup";

// ─── Types ────────────────────────────────────────────────────────────────────
type SearchTab = "flights" | "hotels";
type SortKey = "price" | "duration" | "stops";
type HotelSort = "price" | "rating" | "stars";

interface Flight {
  id: string; price: number; currency: string;
  airline: string; airlineName: string;
  departs: string; arrives: string;
  fromIata: string; toIata: string;
  stops: number; duration: string;
  segments: FlightSegment[];
  returnFlight: { departs: string; arrives: string; stops: number; duration: string; segments: FlightSegment[]; fromIata: string; toIata: string } | null;
}
interface FlightSegment { airline: string; flightNumber: string; fromIata: string; toIata: string; departs: string; arrives: string; duration: string; }
interface Hotel {
  id: string; name: string; chainName?: string;
  stars: number; rating?: number; ratingCount?: number;
  pricePerNight: number; totalPrice: number; currency: string; nights: number;
  address: string; city: string; checkIn: string; checkOut: string;
  amenities: string[]; photos: string[]; rooms: number; guests: number;
  cancellable: boolean; cancellationDeadline?: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt12 = (iso: string) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "--";
const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
const fmtDur = (dur: string) => { const m = dur?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return m ? `${m[1]??0}h ${m[2]??0}m` : dur; };
const stopsLabel = (n: number) => n === 0 ? "Nonstop" : n === 1 ? "1 stop" : `${n} stops`;
const durMins = (dur: string) => { const m = dur?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return m ? (Number(m[1]??0)*60)+Number(m[2]??0) : 9999; };
const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

// ─── Airport Input ────────────────────────────────────────────────────────────
function AirportInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (val: string, iata: string) => void; placeholder: string }) {
  const [suggestions, setSuggestions] = useState<AirportResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
      <input type="text" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value, ""); const s = suggestAirports(e.target.value); setSuggestions(s); setOpen(s.length > 0); }}
        onFocus={() => { if (value.length >= 2) { const s = suggestAirports(value); setSuggestions(s); setOpen(s.length > 0); } }}
        className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white placeholder:text-slate-500 focus:border-[#f4c95d]/60 focus:outline-none" />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
          {suggestions.map(a => (
            <button key={a.iata} type="button"
              onMouseDown={() => { onChange(`${a.city} (${a.iata})`, a.iata); setOpen(false); }}
              onTouchEnd={() => { onChange(`${a.city} (${a.iata})`, a.iata); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-800 last:border-0 active:bg-slate-800">
              <span className="text-xs font-black text-[#f4c95d] w-9 shrink-0">{a.iata}</span>
              <span><p className="text-sm font-semibold text-white">{a.city}</p><p className="text-xs text-slate-400">{a.name}</p></span>
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
    <button type="button" onClick={onSelect} className="w-full text-left rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden active:scale-[0.99] transition-transform">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div><span className="text-xs font-bold text-slate-300">{flight.airline}</span>{flight.airlineName && <span className="text-xs text-slate-500"> · {flight.airlineName}</span>}</div>
          <div className="text-right"><span className="text-2xl font-black text-white">${Math.round(flight.price).toLocaleString()}</span><p className="text-[10px] text-slate-500">per person</p></div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="text-center w-16"><p className="text-lg font-bold text-white">{fmt12(flight.departs)}</p><p className="text-xs text-slate-400">{flight.fromIata}</p></div>
          <div className="flex-1 flex flex-col items-center gap-0.5">
            <p className="text-[10px] text-slate-500">{fmtDur(flight.duration)}</p>
            <div className="w-full flex items-center gap-1"><div className="h-px flex-1 bg-slate-600"/>{flight.stops>0&&<div className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"/>}<div className="h-px flex-1 bg-slate-600"/><div className="w-1.5 h-1.5 rounded-full border border-slate-500 shrink-0"/></div>
            <p className="text-[10px] font-medium text-slate-400">{stopsLabel(flight.stops)}</p>
          </div>
          <div className="text-center w-16"><p className="text-lg font-bold text-white">{fmt12(flight.arrives)}</p><p className="text-xs text-slate-400">{flight.toIata}</p></div>
        </div>
        {flight.returnFlight && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <p className="text-[10px] text-[#f4c95d] font-bold uppercase mb-1.5">Return · {fmtDate(flight.returnFlight.departs)}</p>
            <div className="flex items-center gap-2">
              <div className="text-center w-16"><p className="text-sm font-bold text-white">{fmt12(flight.returnFlight.departs)}</p><p className="text-[10px] text-slate-400">{flight.returnFlight.fromIata}</p></div>
              <div className="flex-1 text-center"><p className="text-[10px] text-slate-500">{fmtDur(flight.returnFlight.duration)} · {stopsLabel(flight.returnFlight.stops)}</p></div>
              <div className="text-center w-16"><p className="text-sm font-bold text-white">{fmt12(flight.returnFlight.arrives)}</p><p className="text-[10px] text-slate-400">{flight.returnFlight.toIata}</p></div>
            </div>
          </div>
        )}
      </div>
      <div className="bg-[#f4c95d] px-4 py-3 text-center font-black text-sm text-[#0b1f3a]">Select →</div>
    </button>
  );
}

// ─── Hotel Card ───────────────────────────────────────────────────────────────
function HotelCard({ hotel, onSelect }: { hotel: Hotel; onSelect: () => void }) {
  const amenityEmoji: Record<string, string> = { wifi: "📶", parking: "🅿️", pool: "🏊", gym: "💪", spa: "🧖", restaurant: "🍽️", bar: "🍸", breakfast: "🍳", ac: "❄️" };
  return (
    <button type="button" onClick={onSelect} className="w-full text-left rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden active:scale-[0.99] transition-transform">
      {hotel.photos[0] && (
        <div className="relative h-40 bg-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hotel.photos[0]} alt={hotel.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          {hotel.cancellable && (
            <span className="absolute top-2 left-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-black text-white">Free cancellation</span>
          )}
        </div>
      )}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">{hotel.name}</p>
            {hotel.chainName && <p className="text-xs text-slate-400">{hotel.chainName}</p>}
            <p className="text-[10px] text-[#f4c95d] mt-0.5">{stars(hotel.stars)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-white">${Math.round(hotel.pricePerNight).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">per night</p>
            <p className="text-xs text-slate-400">${Math.round(hotel.totalPrice).toLocaleString()} total</p>
          </div>
        </div>
        {hotel.rating && (
          <p className="text-xs text-slate-400 mb-2">⭐ {hotel.rating.toFixed(1)}{hotel.ratingCount ? ` (${hotel.ratingCount.toLocaleString()} reviews)` : ""}</p>
        )}
        <p className="text-xs text-slate-500 mb-2 truncate">{hotel.address}</p>
        {hotel.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hotel.amenities.slice(0, 5).map(a => (
              <span key={a} className="text-[10px] text-slate-400 bg-slate-700/50 rounded-full px-2 py-0.5">
                {amenityEmoji[a.toLowerCase()] ?? "✓"} {a}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="bg-[#f4c95d] px-4 py-3 text-center font-black text-sm text-[#0b1f3a]">Select hotel →</div>
    </button>
  );
}

// ─── Hotel Detail ─────────────────────────────────────────────────────────────
function HotelDetail({ hotel, onBack, onBook }: { hotel: Hotel; onBack: () => void; onBook: () => void }) {
  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
        <button type="button" onClick={onBack} className="text-slate-400 text-sm">← Back</button>
        <h1 className="text-base font-black text-white truncate">{hotel.name}</h1>
      </div>
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {hotel.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto rounded-2xl">
            {hotel.photos.slice(0, 3).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt="" className="h-40 w-auto rounded-2xl object-cover shrink-0" />
            ))}
          </div>
        )}
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-black text-white text-lg">{hotel.name}</p>
              <p className="text-[10px] text-[#f4c95d]">{stars(hotel.stars)}</p>
              {hotel.rating && <p className="text-sm text-slate-400 mt-1">⭐ {hotel.rating.toFixed(1)} · {hotel.ratingCount?.toLocaleString()} reviews</p>}
              <p className="text-xs text-slate-500 mt-1">{hotel.address}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-black text-[#f4c95d]">${Math.round(hotel.totalPrice).toLocaleString()}</p>
              <p className="text-xs text-slate-400">${Math.round(hotel.pricePerNight)}/night · {hotel.nights} nights</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your stay</p>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Check-in</span><span className="font-bold text-white">{fmtDate(hotel.checkIn)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Check-out</span><span className="font-bold text-white">{fmtDate(hotel.checkOut)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Rooms</span><span className="font-bold text-white">{hotel.rooms}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Guests</span><span className="font-bold text-white">{hotel.guests}</span></div>
          {hotel.cancellable && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-emerald-400 text-xs">✓</span>
              <span className="text-xs text-emerald-400">Free cancellation{hotel.cancellationDeadline ? ` until ${fmtDate(hotel.cancellationDeadline)}` : ""}</span>
            </div>
          )}
        </div>
        {hotel.amenities.length > 0 && (
          <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Amenities</p>
            <div className="flex flex-wrap gap-2">
              {hotel.amenities.map(a => <span key={a} className="text-xs text-slate-300 bg-slate-700/50 rounded-full px-3 py-1">{a}</span>)}
            </div>
          </div>
        )}
        <button type="button" onClick={onBook} className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base active:opacity-80">
          Book for ${Math.round(hotel.totalPrice).toLocaleString()} →
        </button>
        <button type="button" onClick={onBack} className="w-full text-center text-slate-400 text-sm py-2">See other hotels</button>
      </div>
    </div>
  );
}

// ─── Hotel Checkout ───────────────────────────────────────────────────────────
function HotelCheckout({ hotel, onCancel, onComplete }: { hotel: Hotel; onCancel: () => void; onComplete: (ref: string) => void }) {
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"form"|"confirm"|"processing"|"done"|"error">("form");
  const [bookingRef, setBookingRef] = useState(""); const [errMsg, setErrMsg] = useState("");

  const book = async () => {
    setStep("processing");
    try {
      const res = await fetch("/api/hotels/book", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id, guests: [{ firstName, lastName, email, phone }],
          hotelSummary: { totalPrice: hotel.totalPrice, currency: hotel.currency } }) });
      const d = await res.json();
      if (!res.ok || !d.success) { setErrMsg(d.error ?? "Booking failed"); setStep("error"); return; }
      setBookingRef(d.bookingReference ?? d.bookingId);
      setStep("done"); onComplete(d.bookingReference ?? "");
    } catch { setErrMsg("Connection error"); setStep("error"); }
  };

  if (step === "done") return (
    <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">🏨</div>
      <h2 className="text-2xl font-black text-white mb-2">Hotel booked!</h2>
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-6 py-4 mb-6 w-full max-w-sm">
        <p className="text-xs text-slate-400 mb-1">Booking reference</p>
        <p className="text-3xl font-black text-emerald-400 tracking-widest">{bookingRef}</p>
      </div>
      <p className="text-sm font-bold text-white mb-1">{hotel.name}</p>
      <p className="text-sm text-slate-400 mb-6">{fmtDate(hotel.checkIn)} → {fmtDate(hotel.checkOut)} · {hotel.nights} nights</p>
      <Link href="/travel-assistant" className="block w-full max-w-sm py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-center">View my trips →</Link>
    </div>
  );
  if (step === "processing") return (
    <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-4 animate-bounce">🏨</div>
      <h2 className="text-xl font-black text-white mb-2">Booking your hotel…</h2>
      <p className="text-slate-400 text-sm">Don't close this page.</p>
    </div>
  );
  if (step === "error") return (
    <div className="min-h-screen bg-[#0b1f3a] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-4">❌</div>
      <h2 className="text-xl font-black text-white mb-2">Booking failed</h2>
      <p className="text-slate-400 text-sm mb-6">{errMsg}</p>
      <button type="button" onClick={() => setStep("confirm")} className="w-full max-w-sm py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black mb-3">Try again</button>
      <button type="button" onClick={onCancel} className="text-slate-400 text-sm">Back to search</button>
    </div>
  );
  if (step === "confirm") return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
        <button type="button" onClick={() => setStep("form")} className="text-slate-400 text-sm">← Edit</button>
        <h1 className="text-base font-black text-white">Review & pay</h1>
      </div>
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
          <p className="font-black text-white">{hotel.name}</p>
          <p className="text-sm text-slate-400">{fmtDate(hotel.checkIn)} → {fmtDate(hotel.checkOut)} · {hotel.nights} nights</p>
          <p className="text-2xl font-black text-[#f4c95d] mt-2">${Math.round(hotel.totalPrice).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Guest</p>
          <p className="font-bold text-white">{firstName} {lastName}</p>
          <p className="text-sm text-slate-400">{email} · {phone}</p>
        </div>
        {hotel.cancellable && <p className="text-sm text-emerald-400 text-center">✓ Free cancellation included</p>}
        <button type="button" onClick={book} className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base">Confirm & pay ${Math.round(hotel.totalPrice).toLocaleString()} →</button>
        <button type="button" onClick={onCancel} className="w-full text-center text-slate-400 text-sm py-2">Cancel</button>
      </div>
    </div>
  );

  // Form
  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
        <button type="button" onClick={onCancel} className="text-slate-400 text-sm">← Back</button>
        <h1 className="text-base font-black text-white">Guest details</h1>
      </div>
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-3 flex items-center justify-between">
          <div><p className="text-sm font-bold text-white truncate">{hotel.name}</p><p className="text-xs text-slate-400">{fmtDate(hotel.checkIn)} → {fmtDate(hotel.checkOut)}</p></div>
          <p className="text-lg font-black text-[#f4c95d] shrink-0">${Math.round(hotel.totalPrice)}</p>
        </div>
        {[["First name", firstName, setFirstName, "As on ID"], ["Last name", lastName, setLastName, "As on ID"],
          ["Email", email, setEmail, "Confirmation sent here"], ["Phone", phone, setPhone, "+1 555 000 0000"]].map(([label, val, set, ph]) => (
          <div key={label as string}>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label as string}</label>
            <input type={label === "Email" ? "email" : label === "Phone" ? "tel" : "text"}
              value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)}
              placeholder={ph as string}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-[#f4c95d]/60" />
          </div>
        ))}
        <button type="button" onClick={() => { if (firstName && lastName && email) setStep("confirm"); }}
          className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base">
          Review booking →
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="rounded-2xl border border-slate-700 bg-[#111e33] p-4 animate-pulse">
          <div className="flex justify-between mb-3"><div className="h-3 w-24 bg-slate-700 rounded"/><div className="h-7 w-16 bg-slate-700 rounded"/></div>
          <div className="flex items-center gap-3"><div className="h-5 w-14 bg-slate-700 rounded"/><div className="h-px flex-1 bg-slate-700"/><div className="h-5 w-14 bg-slate-700 rounded"/></div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type FlightScreen = "search" | "results" | "detail" | "checkout";
type HotelScreen = "search" | "results" | "detail" | "checkout";

export default function BookPage() {
  const [tab, setTab] = useState<SearchTab>("flights");

  // ── FLIGHT STATE ──────────────────────────────────────────────────────────
  const [tripType, setTripType] = useState<"roundtrip"|"oneway">("roundtrip");
  const [fromDisplay, setFromDisplay] = useState("");  const [fromIata, setFromIata] = useState("");
  const [toDisplay, setToDisplay] = useState("");      const [toIata, setToIata] = useState("");
  const [depart, setDepart] = useState("");            const [returnD, setReturnD] = useState("");
  const [passengers, setPassengers] = useState(1);    const [cabin, setCabin] = useState("economy");
  const [flightScreen, setFlightScreen] = useState<FlightScreen>("search");
  const [flights, setFlights] = useState<Flight[]>([]); const [flightTotal, setFlightTotal] = useState(0);
  const [flightLoading, setFlightLoading] = useState(false); const [flightError, setFlightError] = useState<string|null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight|null>(null);
  const [sort, setSort] = useState<SortKey>("price");
  const [filterNonstop, setFilterNonstop] = useState(false);
  const [filterMaxPrice, setFilterMaxPrice] = useState<number|null>(null);
  const [filterAirline, setFilterAirline] = useState<string|null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [priceCalendar, setPriceCalendar] = useState<Record<string,number>>({});
  const [inCheckout, setInCheckout] = useState(false);
  const [loyaltyBalances, setLoyaltyBalances] = useState<LoyaltyBalance[]>([]);

  // ── HOTEL STATE ───────────────────────────────────────────────────────────
  const [hotelDest, setHotelDest] = useState("");     const [hotelDestIata, setHotelDestIata] = useState("");
  const [checkIn, setCheckIn] = useState("");         const [checkOut, setCheckOut] = useState("");
  const [hotelGuests, setHotelGuests] = useState(1); const [hotelRooms, setHotelRooms] = useState(1);
  const [hotelScreen, setHotelScreen] = useState<HotelScreen>("search");
  const [hotels, setHotels] = useState<Hotel[]>([]);  const [hotelTotal, setHotelTotal] = useState(0);
  const [hotelLoading, setHotelLoading] = useState(false); const [hotelError, setHotelError] = useState<string|null>(null);
  const [selectedHotel, setSelectedHotel] = useState<Hotel|null>(null);
  const [hotelSort, setHotelSort] = useState<HotelSort>("price");
  const [hotelCheckout, setHotelCheckout] = useState(false);

  useEffect(() => { fetch("/api/loyalty").then(r=>r.json()).then(d=>{ if(d.balances) setLoyaltyBalances(d.balances); }).catch(()=>{}); }, []);

  const resolveIata = useCallback((display: string, known: string) => {
    if (known) return known;
    const r = resolveAirport(display);
    return r?.iata ?? display.trim().toUpperCase().slice(0,3);
  }, []);

  const swap = () => { setFromDisplay(toDisplay); setFromIata(toIata); setToDisplay(fromDisplay); setToIata(fromIata); };

  // ── FLIGHT SEARCH ─────────────────────────────────────────────────────────
  const searchFlights = async () => {
    const origin = resolveIata(fromDisplay, fromIata);
    const destination = resolveIata(toDisplay, toIata);
    if (!fromDisplay.trim()) { setFlightError("Enter where you're flying from."); return; }
    if (!toDisplay.trim()) { setFlightError("Enter where you're flying to."); return; }
    if (!depart) { setFlightError("Select a departure date."); return; }
    if (tripType === "roundtrip" && !returnD) { setFlightError("Select a return date."); return; }
    setFlightLoading(true); setFlightError(null); setFlights([]); setFlightScreen("results");
    // Calendar in background
    fetch(`/api/flights/search?origin=${origin}&destination=${destination}&departDate=${depart}`)
      .then(r=>r.json()).then(d=>{ if(d.prices) setPriceCalendar(d.prices); }).catch(()=>{});
    try {
      const res = await fetch("/api/flights/search", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, departDate: depart, returnDate: tripType==="roundtrip"?returnD:undefined, passengers, cabin }) });
      const d = await res.json();
      if (!res.ok) { setFlightError(d.error ?? "Search failed."); return; }
      setFlights(d.flights ?? []); setFlightTotal(d.total ?? 0);
      if (!(d.flights?.length)) setFlightError(`No flights found from ${origin} to ${destination} on ${depart}. Try different dates or a nearby airport.`);
    } catch { setFlightError("Connection error — try again."); }
    finally { setFlightLoading(false); }
  };

  // ── HOTEL SEARCH ──────────────────────────────────────────────────────────
  const searchHotels = async () => {
    const dest = hotelDestIata || hotelDest.trim().toUpperCase().slice(0,3);
    if (!hotelDest.trim()) { setHotelError("Enter a destination."); return; }
    if (!checkIn) { setHotelError("Select a check-in date."); return; }
    if (!checkOut) { setHotelError("Select a check-out date."); return; }
    setHotelLoading(true); setHotelError(null); setHotels([]); setHotelScreen("results");
    try {
      const res = await fetch("/api/hotels/search", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: dest, checkIn, checkOut, guests: hotelGuests, rooms: hotelRooms }) });
      const d = await res.json();
      if (!res.ok) { setHotelError(d.error ?? "Hotel search failed."); return; }
      setHotels(d.hotels ?? []); setHotelTotal(d.total ?? 0);
      if (!(d.hotels?.length)) setHotelError(`No hotels found in ${dest}. Try another destination or dates.`);
    } catch { setHotelError("Connection error — try again."); }
    finally { setHotelLoading(false); }
  };

  // ── FLIGHT DETAIL / CHECKOUT ───────────────────────────────────────────────
  if (inCheckout && selectedFlight) {
    return <CheckoutFlow flight={selectedFlight} passengers={passengers} onCancel={()=>setInCheckout(false)} onComplete={()=>setInCheckout(false)} />;
  }
  if (flightScreen === "detail" && selectedFlight) {
    const trueCost = calcTrueCost(selectedFlight.price, selectedFlight.airline, cabin, selectedFlight.fromIata, !!selectedFlight.returnFlight);
    const pointsOpts = calcPointsOptions(selectedFlight.price, selectedFlight.airline, loyaltyBalances);
    return (
      <div className="min-h-screen bg-[#0b1f3a]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
          <button type="button" onClick={()=>setFlightScreen("results")} className="text-slate-400 text-sm">← Back</button>
          <h1 className="text-base font-black text-white">Flight details</h1>
        </div>
        <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-5 py-4 flex items-center justify-between">
            <div><p className="text-xs text-slate-400">{selectedFlight.fromIata} → {selectedFlight.toIata}</p><p className="text-lg font-bold text-white">{fmtDate(selectedFlight.departs)}</p><p className="text-sm text-slate-300">{selectedFlight.airline} · {stopsLabel(selectedFlight.stops)}</p></div>
            <p className="text-3xl font-black text-white">${Math.round(selectedFlight.price)}</p>
          </div>
          {/* True cost */}
          <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">True trip cost</p>
            <div className="space-y-2">
              {trueCost.breakdown.map((item,i)=>(
                <div key={i} className="flex justify-between text-sm"><span className="text-slate-400">{item.label}</span><span className="text-white font-semibold">{item.note??`$${item.amount}`}</span></div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-700 font-black">
                <span className="text-white">Real total</span><span className="text-[#f4c95d] text-lg">${trueCost.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {/* Points */}
          {pointsOpts.length > 1 && (
            <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Pay with points?</p>
              <div className="space-y-2">
                {pointsOpts.map((opt,i)=>(
                  <div key={i} className={`rounded-xl px-3 py-2.5 border ${opt.recommendation==="use"?"border-emerald-500/40 bg-emerald-950/20":"border-slate-700/50"}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-bold text-white">{opt.label}</span>
                      {opt.recommendation==="use"&&<span className="text-[10px] font-black text-emerald-400 uppercase">Best</span>}
                    </div>
                    <p className="text-xs text-slate-400">{opt.reason}</p>
                    {opt.milesUsed&&<p className="text-xs text-slate-300 mt-1 font-semibold">{opt.milesUsed.toLocaleString()} points</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={()=>setInCheckout(true)} className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base active:opacity-80">Book this flight →</button>
          <button type="button" onClick={()=>setFlightScreen("results")} className="w-full text-center text-slate-400 text-sm py-2">See other flights</button>
        </div>
      </div>
    );
  }

  // ── HOTEL DETAIL / CHECKOUT ───────────────────────────────────────────────
  if (hotelCheckout && selectedHotel) {
    return <HotelCheckout hotel={selectedHotel} onCancel={()=>setHotelCheckout(false)} onComplete={()=>setHotelCheckout(false)} />;
  }
  if (hotelScreen === "detail" && selectedHotel) {
    return <HotelDetail hotel={selectedHotel} onBack={()=>setHotelScreen("results")} onBook={()=>setHotelCheckout(true)} />;
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────
  if (tab === "flights" && flightScreen === "results") {
    const filtered = flights.filter(f => (!filterNonstop||f.stops===0) && (!filterMaxPrice||f.price<=filterMaxPrice) && (!filterAirline||f.airline===filterAirline));
    const uniqueAirlines = [...new Set(flights.map(f=>f.airline))];
    const maxP = flights.length ? Math.max(...flights.map(f=>f.price)) : 0;
    const minP = flights.length ? Math.min(...flights.map(f=>f.price)) : 0;
    const sorted = [...filtered].sort((a,b)=>sort==="price"?a.price-b.price:sort==="duration"?durMins(a.duration)-durMins(b.duration):a.stops-b.stops);
    return (
      <div className="min-h-screen bg-[#0b1f3a]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
          <button type="button" onClick={()=>{ setFlightScreen("search"); setFlightError(null); }} className="text-slate-400 text-sm shrink-0">← Edit</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{resolveIata(fromDisplay,fromIata)} → {resolveIata(toDisplay,toIata)}</p>
            <p className="text-xs text-slate-400">{fmtDate(depart)}{returnD?` · Return ${fmtDate(returnD)}`:" · One way"} · {passengers} {passengers===1?"adult":"adults"}</p>
          </div>
        </div>
        <div className="px-4 py-4 max-w-lg mx-auto">
          {/* Price calendar */}
          {Object.keys(priceCalendar).length > 0 && !flightLoading && (
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Nearby dates</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {Object.entries(priceCalendar).sort(([a],[b])=>a.localeCompare(b)).map(([date,price])=>{
                  const cheapest = Math.min(...Object.values(priceCalendar));
                  const d = new Date(date);
                  return (
                    <button key={date} type="button" onClick={()=>{ setDepart(date); void searchFlights(); }}
                      className={`shrink-0 rounded-xl px-3 py-2 text-center transition ${date===depart?"bg-[#f4c95d] text-[#0b1f3a]":price===cheapest?"bg-emerald-950/40 border border-emerald-500/40 text-emerald-300":"bg-slate-800 border border-slate-700 text-slate-300"}`}>
                      <p className="text-[10px] font-bold">{d.toLocaleDateString("en-US",{weekday:"short"})}</p>
                      <p className="text-[10px]">{d.toLocaleDateString("en-US",{month:"numeric",day:"numeric"})}</p>
                      <p className={`text-xs font-black mt-0.5 ${price===cheapest&&date!==depart?"text-emerald-400":""}`}>${Math.round(price)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Sort + Filter */}
          {!flightLoading && flights.length > 0 && (
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400 shrink-0">Sort:</p>
                {(["price","duration","stops"] as SortKey[]).map(k=>(
                  <button key={k} type="button" onClick={()=>setSort(k)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${sort===k?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>
                    {k==="price"?"Cheapest":k==="duration"?"Fastest":"Fewest stops"}
                  </button>
                ))}
                <button type="button" onClick={()=>setShowFilters(!showFilters)}
                  className={`ml-auto rounded-xl px-3 py-1.5 text-xs font-bold border ${showFilters?"border-[#f4c95d]/60 text-[#f4c95d]":"border-slate-600 text-slate-400"}`}>
                  Filter {(filterNonstop||filterMaxPrice||filterAirline)?"•":""}
                </button>
              </div>
              {showFilters && (
                <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-white font-semibold">Nonstop only</label>
                    <button type="button" onClick={()=>setFilterNonstop(!filterNonstop)}
                      className={`w-11 h-6 rounded-full transition relative ${filterNonstop?"bg-[#f4c95d]":"bg-slate-600"}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${filterNonstop?"left-6":"left-1"}`}/>
                    </button>
                  </div>
                  {uniqueAirlines.length > 1 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Airline</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={()=>setFilterAirline(null)} className={`rounded-xl px-3 py-1.5 text-xs font-bold border ${!filterAirline?"bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]":"border-slate-600 text-slate-400"}`}>All</button>
                        {uniqueAirlines.map(a=>(
                          <button key={a} type="button" onClick={()=>setFilterAirline(filterAirline===a?null:a)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold border ${filterAirline===a?"bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]":"border-slate-600 text-slate-400"}`}>{a}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {maxP > minP && (
                    <div>
                      <div className="flex justify-between mb-2"><p className="text-xs text-slate-400">Max price</p><p className="text-xs font-bold text-white">{filterMaxPrice?`$${filterMaxPrice}`:"Any"}</p></div>
                      <input type="range" min={minP} max={maxP} step={10} value={filterMaxPrice??maxP}
                        onChange={e=>setFilterMaxPrice(Number(e.target.value)>=maxP?null:Number(e.target.value))}
                        className="w-full accent-[#f4c95d]"/>
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>${Math.round(minP)}</span><span>${Math.round(maxP)}</span></div>
                    </div>
                  )}
                  {(filterNonstop||filterMaxPrice||filterAirline) && (
                    <button type="button" onClick={()=>{ setFilterNonstop(false); setFilterMaxPrice(null); setFilterAirline(null); }} className="text-xs text-red-400 font-semibold">Clear filters</button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">{filtered.length} of {flights.length} flights shown</p>
            </div>
          )}
          {flightLoading && <Skeleton/>}
          {flightError && !flightLoading && (
            <div className="rounded-2xl bg-slate-800 border border-slate-700 px-4 py-5 text-center mt-4">
              <p className="text-2xl mb-2">🔍</p><p className="text-white font-bold mb-1">No flights found</p>
              <p className="text-sm text-slate-400">{flightError}</p>
              <button type="button" onClick={()=>setFlightScreen("search")} className="mt-4 rounded-xl bg-[#f4c95d] text-[#0b1f3a] font-bold px-5 py-2.5 text-sm">Edit search</button>
            </div>
          )}
          {!flightLoading && sorted.length > 0 && (
            <div className="space-y-3">
              {sorted.map(f=><FlightCard key={f.id} flight={f} onSelect={()=>{ setSelectedFlight(f); setFlightScreen("detail"); }}/>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === "hotels" && hotelScreen === "results") {
    const sortedHotels = [...hotels].sort((a,b)=>
      hotelSort==="price"?a.pricePerNight-b.pricePerNight:
      hotelSort==="rating"?(b.rating??0)-(a.rating??0):
      b.stars-a.stars
    );
    return (
      <div className="min-h-screen bg-[#0b1f3a]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50">
          <button type="button" onClick={()=>{ setHotelScreen("search"); setHotelError(null); }} className="text-slate-400 text-sm shrink-0">← Edit</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{hotelDest}</p>
            <p className="text-xs text-slate-400">{fmtDate(checkIn)} → {fmtDate(checkOut)} · {hotelGuests} {hotelGuests===1?"guest":"guests"}</p>
          </div>
        </div>
        <div className="px-4 py-4 max-w-lg mx-auto">
          {!hotelLoading && hotels.length > 0 && (
            <div className="flex gap-2 mb-4">
              <p className="text-xs text-slate-400 self-center">Sort:</p>
              {(["price","rating","stars"] as HotelSort[]).map(k=>(
                <button key={k} type="button" onClick={()=>setHotelSort(k)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${hotelSort===k?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>
                  {k==="price"?"Cheapest":k==="rating"?"Best rated":"Most stars"}
                </button>
              ))}
            </div>
          )}
          {hotelLoading && <Skeleton/>}
          {hotelError && !hotelLoading && (
            <div className="rounded-2xl bg-slate-800 border border-slate-700 px-4 py-5 text-center mt-4">
              <p className="text-2xl mb-2">🏨</p><p className="text-white font-bold mb-1">No hotels found</p>
              <p className="text-sm text-slate-400">{hotelError}</p>
              <button type="button" onClick={()=>setHotelScreen("search")} className="mt-4 rounded-xl bg-[#f4c95d] text-[#0b1f3a] font-bold px-5 py-2.5 text-sm">Edit search</button>
            </div>
          )}
          {!hotelLoading && sortedHotels.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-3">{hotelTotal} hotels found · showing {hotels.length}</p>
              <div className="space-y-3">
                {sortedHotels.map(h=><HotelCard key={h.id} hotel={h} onSelect={()=>{ setSelectedHotel(h); setHotelScreen("detail"); }}/>)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SEARCH SCREENS ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b1f3a]">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Kepi Travel</p>
          <h1 className="text-xl font-black text-white">Book travel</h1>
        </div>
        <Link href="/travel-assistant" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">My trips →</Link>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Flights / Hotels tab */}
        <div className="flex gap-2 mb-5">
          <button type="button" onClick={()=>setTab("flights")} className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${tab==="flights"?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>✈️ Flights</button>
          <button type="button" onClick={()=>setTab("hotels")} className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${tab==="hotels"?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>🏨 Hotels</button>
        </div>

        {tab === "flights" && (
          <>
            {/* One way / Round trip */}
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={()=>setTripType("roundtrip")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tripType==="roundtrip"?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>Round trip</button>
              <button type="button" onClick={()=>setTripType("oneway")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tripType==="oneway"?"bg-[#f4c95d] text-[#0b1f3a]":"border border-slate-600 text-slate-400"}`}>One way</button>
            </div>
            {/* From / To */}
            <div className="relative mb-4">
              <AirportInput label="From" value={fromDisplay} onChange={(v,i)=>{ setFromDisplay(v); setFromIata(i); }} placeholder="City or airport (e.g. Los Angeles)"/>
              <button type="button" onClick={swap} className="absolute right-4 top-1/2 mt-3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 active:bg-slate-600">⇅</button>
              <div className="mt-3"><AirportInput label="To" value={toDisplay} onChange={(v,i)=>{ setToDisplay(v); setToIata(i); }} placeholder="City or airport (e.g. Bari, Italy)"/></div>
            </div>
            <div className={`grid gap-3 mb-4 ${tripType==="roundtrip"?"grid-cols-2":"grid-cols-1"}`}>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Depart</label>
                <input type="date" value={depart} min={new Date().toISOString().split("T")[0]} onChange={e=>setDepart(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#f4c95d]/60"/></div>
              {tripType==="roundtrip" && <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Return</label>
                <input type="date" value={returnD} min={depart||new Date().toISOString().split("T")[0]} onChange={e=>setReturnD(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#f4c95d]/60"/></div>}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Passengers</label>
                <select value={passengers} onChange={e=>setPassengers(Number(e.target.value))} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none">
                  {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} {n===1?"adult":"adults"}</option>)}</select></div>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Cabin</label>
                <select value={cabin} onChange={e=>setCabin(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none">
                  <option value="economy">Economy</option><option value="premium_economy">Premium Eco</option><option value="business">Business</option><option value="first">First</option></select></div>
            </div>
            {flightError && flightScreen==="search" && <div className="rounded-2xl bg-red-900/20 border border-red-500/30 px-4 py-3 mb-4"><p className="text-sm text-red-300">{flightError}</p></div>}
            <button type="button" onClick={searchFlights} className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base active:opacity-80 mb-6">Search flights</button>
            {/* Popular routes */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">Popular routes</p>
              <div className="space-y-2">
                {[{from:"Los Angeles (LAX)",fI:"LAX",to:"New York (JFK)",tI:"JFK"},{from:"Ontario (ONT)",fI:"ONT",to:"Bari, Italy (BRI)",tI:"BRI"},{from:"Los Angeles (LAX)",fI:"LAX",to:"London (LHR)",tI:"LHR"}].map(r=>(
                  <button key={r.fI+r.tI} type="button" onClick={()=>{ setFromDisplay(r.from); setFromIata(r.fI); setToDisplay(r.to); setToIata(r.tI); }}
                    className="w-full flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 text-left active:bg-slate-800">
                    <span className="text-slate-500 text-sm">✈</span>
                    <span><p className="text-sm text-white">{r.fI} → {r.tI}</p><p className="text-xs text-slate-500">{r.from.split("(")[0]?.trim()} → {r.to.split("(")[0]?.trim()}</p></span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "hotels" && (
          <>
            <AirportInput label="Destination" value={hotelDest} onChange={(v,i)=>{ setHotelDest(v); setHotelDestIata(i); }} placeholder="City or airport code (e.g. BRI, MUC, NYC)"/>
            <div className="grid grid-cols-2 gap-3 mt-4 mb-4">
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Check-in</label>
                <input type="date" value={checkIn} min={new Date().toISOString().split("T")[0]} onChange={e=>setCheckIn(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#f4c95d]/60"/></div>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Check-out</label>
                <input type="date" value={checkOut} min={checkIn||new Date().toISOString().split("T")[0]} onChange={e=>setCheckOut(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#f4c95d]/60"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Guests</label>
                <select value={hotelGuests} onChange={e=>setHotelGuests(Number(e.target.value))} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none">
                  {[1,2,3,4].map(n=><option key={n} value={n}>{n} {n===1?"guest":"guests"}</option>)}</select></div>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Rooms</label>
                <select value={hotelRooms} onChange={e=>setHotelRooms(Number(e.target.value))} className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-sm text-white focus:outline-none">
                  {[1,2,3].map(n=><option key={n} value={n}>{n} {n===1?"room":"rooms"}</option>)}</select></div>
            </div>
            {hotelError && hotelScreen==="search" && <div className="rounded-2xl bg-red-900/20 border border-red-500/30 px-4 py-3 mb-4"><p className="text-sm text-red-300">{hotelError}</p></div>}
            <button type="button" onClick={searchHotels} className="w-full py-4 rounded-2xl bg-[#f4c95d] text-[#0b1f3a] font-black text-base active:opacity-80 mb-6">Search hotels</button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-3">Popular destinations</p>
              <div className="space-y-2">
                {[{dest:"Bari, Italy (BRI)",code:"BRI"},{dest:"New York (JFK)",code:"JFK"},{dest:"Rome, Italy (FCO)",code:"FCO"},{dest:"Munich, Germany (MUC)",code:"MUC"}].map(d=>(
                  <button key={d.code} type="button" onClick={()=>{ setHotelDest(d.dest); setHotelDestIata(d.code); }}
                    className="w-full flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 text-left active:bg-slate-800">
                    <span className="text-slate-500">🏨</span>
                    <span><p className="text-sm text-white">{d.dest}</p></span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
