"use client";

import { Wifi, Coffee, Car, Waves, Dumbbell, ArrowUpDown } from "lucide-react";
import {
  formatHotelNightlyPrice,
  formatHotelNightlyPriceCaption,
  formatHotelTotalPrice,
  primaryMatchReason,
  resolveHotelHeroVisual,
  topAmenityIcons,
} from "@/lib/hotels/hotelCardDisplay";
import { hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import type { HotelPayMode } from "@/lib/hotels/hotelPointsDisplay";
import { pointsPerNight } from "@/lib/hotels/hotelPointsDisplay";

function AmenityIcon({ kind }: { kind: string }) {
  const className = "h-4 w-4 text-slate-400";
  if (kind === "wifi") return <Wifi className={className} aria-hidden />;
  if (kind === "breakfast") return <Coffee className={className} aria-hidden />;
  if (kind === "parking") return <Car className={className} aria-hidden />;
  if (kind === "pool") return <Waves className={className} aria-hidden />;
  if (kind === "gym") return <Dumbbell className={className} aria-hidden />;
  if (kind === "elevator") return <ArrowUpDown className={className} aria-hidden />;
  return null;
}

interface HotelRankCardProps {
  hotel: RankedHotelSearchResult;
  totalInSearch: number;
  featured?: boolean;
  compact?: boolean;
  premium?: boolean;
  selected?: boolean;
  onAdd: () => void;
  onDismiss?: () => void;
  onSelect?: () => void;
  payMode?: HotelPayMode;
}

export function HotelRankCard({
  hotel,
  totalInSearch,
  compact = false,
  premium = false,
  selected = false,
  onAdd,
  onDismiss,
  onSelect,
  payMode = "any",
}: HotelRankCardProps) {
  const nightlyPts = pointsPerNight(hotel);
  const showPoints = payMode === "points" || payMode === "any";
  const hero = resolveHotelHeroVisual(hotel);
  const nightlyLabel = formatHotelNightlyPrice(hotel);
  const nightlyCaption = formatHotelNightlyPriceCaption(hotel);
  const totalLabel = formatHotelTotalPrice(hotel);
  const guestScore = hotel.rating !== undefined ? hotel.rating.toFixed(1) : `${hotel.stars}.0`;
  const amenityIcons = topAmenityIcons(hotel.amenities);
  const matchReason = primaryMatchReason(hotel);
  const kepiBookable = hasKepiBookableLiveRate(hotel);
  const selectLabel = kepiBookable ? "View & book in Kepi →" : "Select →";

  if (premium) {
    return (
      <article
        className={`overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition dark:bg-[#0f2744] ${
          selected ? "ring-2 ring-[#f4c95d]" : ""
        }`}
      >
        {hero.kind === "photo" && hero.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.url} alt="" className="h-44 w-full object-cover" />
        ) : (
          <div
            className="flex h-44 w-full items-center justify-center"
            style={{ background: hero.gradient }}
          >
            <span className="text-4xl font-black tracking-wide text-[#f4c95d]">{hero.initials}</span>
          </div>
        )}

        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-xl font-black leading-tight text-slate-900 dark:text-white">{hotel.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {"★".repeat(Math.round(hotel.stars))} · {guestScore} guest score
              {hotel.chainName ? ` · ${hotel.chainName}` : ""}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              {payMode === "points" && nightlyPts ? (
                <>
                  <p className="text-2xl font-black text-[#f4c95d]">{nightlyPts.toLocaleString()}</p>
                  <p className="text-sm text-slate-500">points / night</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-[#f4c95d]">{nightlyLabel}</p>
                  <p className="text-sm text-slate-500">{nightlyCaption}</p>
                </>
              )}
            </div>
            {totalLabel ? <p className="text-right text-sm text-slate-500">{totalLabel}</p> : null}
          </div>

          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{matchReason}</p>

          {kepiBookable ? (
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              Book in Kepi · Stripe checkout
            </p>
          ) : null}

          {amenityIcons.length > 0 ? (
            <div className="flex gap-3">
              {amenityIcons.map((kind) => (
                <AmenityIcon key={kind} kind={kind} />
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-2xl bg-[#f4c95d] py-3.5 text-sm font-black text-[#0b1f3a] hover:bg-[#e8bc4a]"
          >
            {selectLabel}
          </button>
        </div>
      </article>
    );
  }

  if (compact) {
    return (
      <article
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={onSelect ? (event) => event.key === "Enter" && onSelect() : undefined}
        className={`flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm transition dark:bg-[#0f2744] ${
          selected ? "ring-2 ring-[#f4c95d]" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{hotel.name}</p>
          <p className="truncate text-xs text-slate-500">
            {guestScore} · {nightlyLabel}
            {showPoints && nightlyPts ? ` · ${nightlyPts.toLocaleString()} pts` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          className="shrink-0 rounded-xl bg-[#f4c95d] px-3 py-2 text-xs font-black text-[#0b1f3a]"
        >
          {kepiBookable ? "Book" : "Select"}
        </button>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-[#0f2744]">
      {hero.kind === "photo" && hero.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.url} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center" style={{ background: hero.gradient }}>
          <span className="text-3xl font-black text-[#f4c95d]">{hero.initials}</span>
        </div>
      )}
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{hotel.name}</p>
            <p className="text-xs text-slate-500">#{hotel.rank} of {totalInSearch}</p>
          </div>
          <p className="text-lg font-black text-[#f4c95d]">{nightlyLabel}</p>
        </div>
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{matchReason}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onAdd} className="flex-1 rounded-xl bg-[#f4c95d] py-2.5 text-sm font-black text-[#0b1f3a]">
            {selectLabel}
          </button>
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className="rounded-xl px-3 py-2.5 text-xs text-slate-500">
              Skip
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function pickFeaturedHotels(hotels: RankedHotelSearchResult[], count = 3): RankedHotelSearchResult[] {
  const picks: RankedHotelSearchResult[] = [];
  const add = (hotel: RankedHotelSearchResult | undefined): void => {
    if (!hotel || picks.some((row) => row.id === hotel.id)) return;
    picks.push(hotel);
  };

  add(hotels.find((row) => row.tier === "kepi_pick"));
  add(hotels.find((row) => row.tier === "points_play"));
  add(hotels.find((row) => row.tier === "best_value"));
  for (const row of hotels) {
    if (picks.length >= count) break;
    add(row);
  }
  return picks.slice(0, count);
}
