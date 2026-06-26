"use client";

import { TripHotelSearch } from "@/components/travelAssistant/TripHotelSearch";
import type { HotelSearchResult } from "@/lib/hotels/types";

export interface HotelSearchModalProps {
  open: boolean;
  tripName?: string | null;
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
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                Search hotels
              </p>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {tripName?.trim() ? `For ${tripName.trim()}` : "Find your stay"}
              </h2>
              {defaultCity && defaultCheckIn && defaultCheckOut ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Pre-filled from your trip · edit anything before searching
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Kepi ranks every result for value, quality, and points
                </p>
              )}
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TripHotelSearch
            key={`${defaultCity}-${defaultCityIata}-${defaultCheckIn}-${defaultCheckOut}`}
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
