"use client";

import { BOOK_SUBTAB_TOGGLE_CLASS, bookSubTabButtonClass } from "@/components/travelAssistant/bookTabStyles";

interface MobileBookHeaderProps {
  tripName: string;
  flightCount: number;
  hotelCount: number;
}

export function MobileBookHeader({ tripName, flightCount, hotelCount }: MobileBookHeaderProps) {
  return (
    <header className="rounded-2xl bg-[#0F1923] px-5 py-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Book</p>
      <h1 className="mt-1 text-[1.75rem] font-black leading-tight tracking-tight text-white">{tripName}</h1>
      <p className="mt-1 text-[17px] text-slate-300">
        {flightCount} flight{flightCount === 1 ? "" : "s"} · {hotelCount} hotel{hotelCount === 1 ? "" : "s"}
      </p>
    </header>
  );
}

interface MobileBookSegmentToggleProps {
  active: "flights" | "hotels";
  onChange: (segment: "flights" | "hotels") => void;
}

export function MobileBookSegmentToggle({ active, onChange }: MobileBookSegmentToggleProps) {
  return (
    <div className={BOOK_SUBTAB_TOGGLE_CLASS}>
      <button
        type="button"
        onClick={() => onChange("flights")}
        className={bookSubTabButtonClass(active === "flights")}
      >
        Flights
      </button>
      <button
        type="button"
        onClick={() => onChange("hotels")}
        className={bookSubTabButtonClass(active === "hotels")}
      >
        Hotels
      </button>
    </div>
  );
}
