"use client";

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
  if (!open) return null;

  const handleAdd = (hotel: HotelSearchResult): void => {
    onAddHotel(hotel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4 md:p-6 lg:p-8">
      <div className={SEARCH_MODAL_PANEL}>
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                Hotels
              </p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white md:text-xl">
                {segmentLabel ?? (defaultCity ? defaultCity.split("(")[0]?.trim() : "Find your stay")}
              </h2>
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
            key={`${segmentLabel ?? "default"}-${defaultCity}-${defaultCityIata}-${defaultCheckIn}-${defaultCheckOut}`}
            defaultCity={defaultCity}
            defaultCityIata={defaultCityIata}
            defaultCheckIn={defaultCheckIn}
            defaultCheckOut={defaultCheckOut}
            onAddHotel={handleAdd}
          />
        </div>
      </div>
    </div>
  );
}
