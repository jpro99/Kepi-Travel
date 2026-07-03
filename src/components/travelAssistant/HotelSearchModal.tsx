"use client";

import { useEffect, useState } from "react";
import { TripHotelSearch } from "@/components/travelAssistant/TripHotelSearch";
import { SEARCH_MODAL_PANEL } from "@/lib/ui/searchResponsive";
import type { HotelSearchResult } from "@/lib/hotels/types";

export interface HotelSearchModalProps {
  open: boolean;
  tripName?: string | null;
  segmentLabel?: string;
  defaultCity?: string;
  defaultCityIata?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  onClose: () => void;
  onAddHotel: (hotel: HotelSearchResult) => void;
}

export function HotelSearchModal({
  open,
  tripName,
  segmentLabel,
  defaultCity = "",
  defaultCityIata = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  onClose,
  onAddHotel,
}: HotelSearchModalProps) {
  const [searchGeneration, setSearchGeneration] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSearchGeneration((value) => value + 1);
  }, [open, defaultCity, defaultCityIata, defaultCheckIn, defaultCheckOut]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-3 md:p-4">
      <div className={`${SEARCH_MODAL_PANEL} max-h-[96dvh] w-full max-w-[98vw] sm:max-w-[98vw] lg:max-w-6xl xl:max-w-7xl`}>
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                Hotels
              </p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white md:text-xl">
                {segmentLabel ?? (defaultCity ? defaultCity.split("(")[0]?.trim() : "Find your stay")}
              </h2>
              {tripName ? (
                <p className="mt-0.5 text-[11px] text-slate-500">{tripName}</p>
              ) : null}
              {defaultCheckIn && defaultCheckOut ? (
                <p className="mt-0.5 text-[11px] text-slate-500">{defaultCheckIn} → {defaultCheckOut}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close hotel search"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
          <TripHotelSearch
            key={`${defaultCity}-${defaultCityIata}-${defaultCheckIn}-${defaultCheckOut}`}
            defaultCity={defaultCity}
            defaultCityIata={defaultCityIata}
            defaultCheckIn={defaultCheckIn}
            defaultCheckOut={defaultCheckOut}
            searchGeneration={searchGeneration}
            onAddHotel={onAddHotel}
          />
        </div>
      </div>
    </div>
  );
}
