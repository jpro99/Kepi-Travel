"use client";

import { resolveHotelBookUrl } from "@/lib/decision/bookingLinks";
import { hotelMapPinStyle, fitScoreRange } from "@/lib/hotels/hotelMapColors";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

interface HotelDetailSheetProps {
  hotel: RankedHotelSearchResult;
  allHotels: RankedHotelSearchResult[];
  city: string;
  saved?: boolean;
  onSaveToTrip: () => void;
  onClose: () => void;
}

export function HotelDetailSheet({
  hotel,
  allHotels,
  city,
  saved = false,
  onSaveToTrip,
  onClose,
}: HotelDetailSheetProps) {
  const book = resolveHotelBookUrl({
    propertyName: hotel.name,
    chainName: hotel.chainName,
    location: hotel.address || city,
    checkInDate: hotel.checkIn,
    checkOutDate: hotel.checkOut,
    quotedPriceUsd: hotel.totalPrice,
    quoteId: hotel.id,
  });

  const pinStyle = hotelMapPinStyle(hotel, fitScoreRange(allHotels));
  const photos = hotel.photos.filter(Boolean);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:relative sm:max-h-none sm:rounded-2xl sm:border sm:shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hotel details</p>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-700">✕</button>
      </div>

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className="h-36 w-52 shrink-0 rounded-xl object-cover"
            />
          ))}
        </div>
      ) : (
        <div className="mx-4 mt-3 flex h-28 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-900">
          Photos load when you open the booking site
        </div>
      )}

      <div className="space-y-3 px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">{hotel.name}</h3>
            {hotel.chainName ? <p className="text-xs text-slate-500">{hotel.chainName}</p> : null}
            {hotel.address ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hotel.address}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-black text-slate-900 dark:text-white">${Math.round(hotel.pricePerNight)}</p>
            <p className="text-[10px] text-slate-500">/ night · ${Math.round(hotel.totalPrice)} total</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: pinStyle.bg }}
          >
            {pinStyle.label}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {hotel.rating !== undefined ? `${hotel.rating.toFixed(1)} guest score` : `${hotel.stars}★`}
          </span>
          {hotel.badges.slice(0, 3).map((badge) => (
            <span key={badge} className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
              {badge}
            </span>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{hotel.whyLine}</p>

        {hotel.amenities.length > 0 ? (
          <p className="text-[11px] text-slate-500">
            {hotel.amenities.slice(0, 6).join(" · ")}
          </p>
        ) : null}

        <p className="text-[11px] text-slate-500">
          {hotel.checkIn} → {hotel.checkOut} · {hotel.guests} guest{hotel.guests === 1 ? "" : "s"} · {hotel.rooms} room{hotel.rooms === 1 ? "" : "s"}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={book.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500"
          >
            View rooms &amp; prices →
          </a>
          <button
            type="button"
            onClick={onSaveToTrip}
            disabled={saved}
            className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 disabled:border-emerald-400 disabled:bg-emerald-50 disabled:text-emerald-800 dark:border-slate-600 dark:text-slate-100"
          >
            {saved ? "Saved to your trip ✓" : "Save to my trip"}
          </button>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-400">
          Book on Google Hotels or the hotel chain to see live room types, photos, and cancellation rules. Saving here adds it to your Kepi itinerary.
        </p>
      </div>
    </div>
  );
}
