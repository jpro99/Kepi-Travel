"use client";

import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import { formatStayDateRange } from "@/lib/travelAssistant/tripPlanBooking";
import { Building2 } from "lucide-react";

interface TripHotelCityPickerProps {
  cities: PlannedStayCity[];
  tripName?: string | null;
  onPickCity: (city: PlannedStayCity) => void;
}

export function TripHotelCityPicker({ cities, tripName, onPickCity }: TripHotelCityPickerProps) {
  const needed = cities.filter((city) => city.status === "needed");
  const booked = cities.filter((city) => city.status === "booked");

  if (cities.length === 0) return null;

  if (needed.length === 0) {
    return (
      <div className="rounded-[18px] bg-[var(--bg-card)] px-4 py-3 shadow-sm ring-1 ring-[var(--border-default)]">
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          {tripName ? `${tripName} · ` : ""}Stays are set
        </p>
        {booked.map((city) => (
          <p key={city.id} className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {city.city.split("(")[0]?.trim()} · {city.hotelName ?? "Booked"}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-[var(--bg-card)] px-4 py-4 shadow-sm ring-1 ring-[var(--border-default)]">
      <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">Nights still need a stay</h3>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {tripName ? `${tripName} · ` : ""}
        {needed.length} {needed.length === 1 ? "city" : "cities"}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {needed.map((city) => (
          <button
            key={city.id}
            type="button"
            onClick={() => onPickCity(city)}
            className="flex min-h-[48px] items-start gap-3 rounded-2xl bg-[var(--bg-grouped)] px-3 py-3 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-card)]">
              <Building2 className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.85} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
                {city.city.split("(")[0]?.trim()}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {formatStayDateRange(city.checkIn, city.checkOut)}
                {city.nights > 0 ? ` · ${city.nights} night${city.nights === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">Find</span>
          </button>
        ))}
      </div>
    </div>
  );
}
