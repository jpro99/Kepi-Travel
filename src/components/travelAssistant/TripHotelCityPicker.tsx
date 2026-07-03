"use client";

import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import { formatStayDateRange } from "@/lib/travelAssistant/tripPlanBooking";

interface TripHotelCityPickerProps {
  cities: PlannedStayCity[];
  tripName?: string | null;
  onPickCity: (city: PlannedStayCity) => void;
}

function cityEmoji(city: string): string {
  const lower = city.toLowerCase();
  if (lower.includes("rome")) return "🏛";
  if (lower.includes("venice")) return "🛶";
  if (lower.includes("dolomite")) return "🏔";
  if (lower.includes("munich") || lower.includes("germany")) return "🍺";
  if (lower.includes("paris")) return "🗼";
  if (lower.includes("london")) return "🎡";
  if (lower.includes("hawaii") || lower.includes("honolulu")) return "🌺";
  return "🏨";
}

export function TripHotelCityPicker({ cities, tripName, onPickCity }: TripHotelCityPickerProps) {
  const needed = cities.filter((city) => city.status === "needed");
  const booked = cities.filter((city) => city.status === "booked");

  if (cities.length === 0) return null;

  if (needed.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
          {tripName ? `${tripName} · ` : ""}Your hotel{booked.length === 1 ? "" : "s"} {booked.length === 1 ? "is" : "are"} set ✓
        </p>
        {booked.map((city) => (
          <p key={city.id} className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
            {city.city.split("(")[0]?.trim()} · {city.hotelName ?? "Booked"}
          </p>
        ))}
      </div>
    );
  }

  const bookedCount = booked.length;

  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-sky-600 to-cyan-500 p-[1px] shadow-lg">
      <div className="rounded-[23px] bg-gradient-to-br from-slate-950 via-[#0c2447] to-slate-900 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Your adventure</p>
        <h3 className="mt-1 text-lg font-black text-white">
          {needed > 0 ? "Which city are we booking next?" : "Your stays are coming together ✨"}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-sky-100/75">
          {tripName ? `${tripName} · ` : ""}
          {bookedCount > 0 ? `${bookedCount} booked · ` : ""}
          {needed.length} still need{needed.length === 1 ? "s" : ""} a hotel
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {needed.map((city) => {
            const isBooked = city.status === "booked";
            return (
              <button
                key={city.id}
                type="button"
                onClick={() => onPickCity(city)}
                className={`group relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition ${
                  isBooked
                    ? "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                    : "border-white/15 bg-white/5 hover:border-sky-300/50 hover:bg-white/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
                    {cityEmoji(city.city)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{city.city.split("(")[0]?.trim()}</p>
                    <p className="text-[11px] text-sky-100/70">{formatStayDateRange(city.checkIn, city.checkOut)}</p>
                    <p className="text-[10px] text-sky-200/60">{city.nights} night{city.nights === 1 ? "" : "s"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      isBooked ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-400/20 text-amber-100"
                    }`}
                  >
                    {isBooked ? "✓ Booked" : "Search"}
                  </span>
                </div>
                {isBooked && city.hotelName ? (
                  <p className="mt-2 truncate text-[10px] font-medium text-emerald-100/90">{city.hotelName}</p>
                ) : (
                  <p className="mt-2 text-[10px] font-semibold text-sky-200/80 group-hover:text-white">
                    Tap to search hotels →
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
