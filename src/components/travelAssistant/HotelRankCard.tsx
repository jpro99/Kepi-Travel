"use client";

import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function starLabel(count: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(count)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

interface HotelRankCardProps {
  hotel: RankedHotelSearchResult;
  totalInSearch: number;
  featured?: boolean;
  compact?: boolean;
  selected?: boolean;
  onAdd: () => void;
  onDismiss: () => void;
  onSelect?: () => void;
}

export function HotelRankCard({
  hotel,
  totalInSearch,
  featured = false,
  compact = false,
  selected = false,
  onAdd,
  onDismiss,
  onSelect,
}: HotelRankCardProps) {
  if (compact) {
    return (
      <article
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={onSelect ? (event) => event.key === "Enter" && onSelect() : undefined}
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
          selected
            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
            hotel.tier === "kepi_pick" || hotel.tier === "personal"
              ? "bg-emerald-800 text-white"
              : hotel.tier === "best_value"
                ? "bg-amber-500 text-slate-900"
                : "bg-orange-600 text-white"
          }`}
        >
          #{hotel.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{hotel.name}</p>
          <p className="truncate text-[10px] text-slate-500">
            {hotel.chainName ? `${hotel.chainName} · ` : ""}
            {hotel.rating !== undefined ? `${hotel.rating.toFixed(1)}★` : `${hotel.stars}★`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-slate-900 dark:text-white">${Math.round(hotel.pricePerNight)}</p>
          <p className="text-[9px] text-slate-400">/ night</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          className="shrink-0 rounded-lg bg-sky-600 px-2 py-1.5 text-[10px] font-bold text-white"
        >
          View
        </button>
      </article>
    );
  }

  const isKepiPick = hotel.tier === "kepi_pick";
  const cpp = hotel.pointsOption?.cppAchieved;

  return (
    <article
      className={`overflow-hidden rounded-2xl border ${
        featured && isKepiPick
          ? "border-[#f4c95d] bg-gradient-to-br from-[#0b1f3a] to-[#123456] text-white shadow-md"
          : featured
            ? "border-sky-300 bg-white shadow-sm dark:border-sky-700 dark:bg-slate-900"
            : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50"
      }`}
    >
      {hotel.photos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hotel.photos[0]} alt="" className={`w-full object-cover ${featured ? "h-36 md:h-44" : "h-24"}`} />
      ) : null}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-sm font-black text-white">
            #{hotel.rank}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`font-bold leading-snug ${featured && isKepiPick ? "text-white" : "text-slate-900 dark:text-white"}`}>
              {hotel.name}
            </p>
            {hotel.chainName ? (
              <p className={`text-xs ${featured && isKepiPick ? "text-slate-300" : "text-slate-500"}`}>{hotel.chainName}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-lg font-black ${featured && isKepiPick ? "text-[#f4c95d]" : "text-slate-900 dark:text-white"}`}>
              ${Math.round(hotel.pricePerNight)}
            </p>
            <p className={`text-[10px] ${featured && isKepiPick ? "text-slate-400" : "text-slate-500"}`}>/ night</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip
            label="Stars"
            value={starLabel(hotel.stars)}
            dark={featured && isKepiPick}
          />
          <StatChip
            label="Guest score"
            value={hotel.rating !== undefined ? hotel.rating.toFixed(1) : "—"}
            dark={featured && isKepiPick}
          />
          <StatChip
            label="¢ / point"
            value={cpp !== undefined ? `${cpp.toFixed(1)}¢` : "Cash best"}
            dark={featured && isKepiPick}
          />
          <StatChip
            label="City rank"
            value={`${hotel.rank} of ${totalInSearch}`}
            dark={featured && isKepiPick}
          />
        </div>

        {hotel.cityRankLabel ? (
          <p className={`mt-2 text-xs ${featured && isKepiPick ? "text-sky-200" : "text-sky-700 dark:text-sky-300"}`}>
            {hotel.cityRankLabel}
          </p>
        ) : null}
        {hotel.whyLine ? (
          <p className={`mt-1 text-xs ${featured && isKepiPick ? "text-slate-300" : "text-slate-600 dark:text-slate-400"}`}>
            {hotel.whyLine}
          </p>
        ) : null}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAdd}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
              featured && isKepiPick ? "bg-[#f4c95d] text-[#0b1f3a]" : "bg-[#0b1f3a] text-[#f4c95d]"
            }`}
          >
            View rooms &amp; prices
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
              featured && isKepiPick
                ? "border-slate-500 text-slate-300"
                : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
            }`}
          >
            Not for me
          </button>
        </div>
      </div>
    </article>
  );
}

function StatChip({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${dark ? "bg-white/10" : "bg-white dark:bg-slate-800"}`}>
      <p className={`text-[9px] font-bold uppercase tracking-wide ${dark ? "text-slate-400" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`text-xs font-bold ${dark ? "text-white" : "text-slate-900 dark:text-white"}`}>{value}</p>
    </div>
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
