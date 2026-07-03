"use client";

import {
  hotelInventoryBadgeClassName,
  resolveHotelInventoryBadge,
} from "@/lib/hotels/hotelInventoryBadge";
import type { HotelSearchResult } from "@/lib/hotels/types";

interface HotelInventoryBadgePillProps {
  hotel: Pick<HotelSearchResult, "id" | "browseOnly" | "bookOfferId" | "pricePerNight">;
  compact?: boolean;
  className?: string;
}

export function HotelInventoryBadgePill({ hotel, compact = false, className = "" }: HotelInventoryBadgePillProps) {
  const badge = resolveHotelInventoryBadge(hotel);
  const label = compact ? badge.shortLabel : badge.label;

  return (
    <span
      title={badge.description}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${hotelInventoryBadgeClassName(badge.kind)} ${className}`}
    >
      {label}
    </span>
  );
}
