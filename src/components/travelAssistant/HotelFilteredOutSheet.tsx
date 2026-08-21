"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { HotelMatchEvaluation } from "@/lib/hotels/hotelSearchFilters";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

export interface FilteredHotelRow {
  hotel: RankedHotelSearchResult;
  evaluation: HotelMatchEvaluation;
}

interface HotelFilteredOutSheetProps {
  open: boolean;
  onClose: () => void;
  rows: FilteredHotelRow[];
  onAdjustPreferences: () => void;
}

export function HotelFilteredOutSheet({
  open,
  onClose,
  rows,
  onAdjustPreferences,
}: HotelFilteredOutSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <button type="button" aria-label="Close hidden hotels" onClick={onClose} className="fixed inset-0 z-[94] overscroll-contain bg-slate-950/50" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-3 bottom-3 z-[95] mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Filtered out</p>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {rows.length} hotel{rows.length === 1 ? "" : "s"} don&apos;t match
              </h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400">
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-500">Kepi hid these based on your budget and stay style.</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Every hotel in this search matches your filters.</p>
          ) : (
            rows.map(({ hotel, evaluation }) => (
              <article key={hotel.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{hotel.name}</p>
                    <p className="text-xs text-slate-500">
                      {hotel.browseOnly || hotel.pricePerNight <= 0
                        ? "Check site for price"
                        : `$${Math.round(hotel.pricePerNight)}/night`}
                      {hotel.chainName ? ` · ${hotel.chainName}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800">
                    #{hotel.rank}
                  </span>
                </div>
                {evaluation.blockers.length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {evaluation.blockers.map((blocker) => (
                      <li key={blocker} className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                        • {blocker}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              onClose();
              onAdjustPreferences();
            }}
            className="w-full rounded-2xl bg-sky-600 py-3 text-sm font-black text-white"
          >
            Adjust budget & stay style
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
