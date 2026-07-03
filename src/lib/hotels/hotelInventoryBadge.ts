import type { HotelSearchResult } from "@/lib/hotels/types";
import { hasDisplayNightlyRate, hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";

export type HotelInventoryKind = "kepi_live" | "browse_google" | "estimated" | "indicative";

export interface HotelInventoryBadge {
  kind: HotelInventoryKind;
  label: string;
  shortLabel: string;
  description: string;
}

const BADGES: Record<HotelInventoryKind, HotelInventoryBadge> = {
  kepi_live: {
    kind: "kepi_live",
    label: "Live in Kepi",
    shortLabel: "Live",
    description: "Can checkout in Kepi — tap Book to verify the rate is still available before you pay.",
  },
  browse_google: {
    kind: "browse_google",
    label: "Browse on Google",
    shortLabel: "Google",
    description: "Real property listing — open Google Hotels for live pricing.",
  },
  estimated: {
    kind: "estimated",
    label: "Estimated sample",
    shortLabel: "Sample",
    description: "Sample listing for discovery — not a live rate or guaranteed availability.",
  },
  indicative: {
    kind: "indicative",
    label: "Verify price",
    shortLabel: "Verify",
    description: "Indicative rate from our search partner — confirm before booking.",
  },
};

export function isEstimatedHotelInventory(hotel: Pick<HotelSearchResult, "id">): boolean {
  return hotel.id.startsWith("est-");
}

export function isCatalogBrowseHotel(hotel: Pick<HotelSearchResult, "id" | "browseOnly">): boolean {
  return hotel.id.startsWith("liteapi-catalog-") || Boolean(hotel.browseOnly);
}

export function resolveHotelInventoryKind(
  hotel: Pick<HotelSearchResult, "id" | "browseOnly" | "bookOfferId" | "pricePerNight">,
): HotelInventoryKind {
  if (isEstimatedHotelInventory(hotel)) return "estimated";
  if (hasKepiBookableLiveRate(hotel)) return "kepi_live";
  if (isCatalogBrowseHotel(hotel)) return "browse_google";
  if (hasDisplayNightlyRate(hotel)) return "indicative";
  return "browse_google";
}

export function resolveHotelInventoryBadge(
  hotel: Pick<HotelSearchResult, "id" | "browseOnly" | "bookOfferId" | "pricePerNight">,
): HotelInventoryBadge {
  return BADGES[resolveHotelInventoryKind(hotel)];
}

export function hotelInventoryBadgeClassName(kind: HotelInventoryKind): string {
  switch (kind) {
    case "kepi_live":
      return "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "browse_google":
      return "border border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100";
    case "estimated":
      return "border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";
    case "indicative":
      return "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-800";
  }
}

/** Banner copy for search results — separates LiteAPI live path from pending Duffel Stays. */
export function buildHotelSearchProviderHeadline(input: {
  source: string | null;
  liveBookableCount: number;
}): string {
  const { source, liveBookableCount } = input;
  if (source === "estimated") {
    return "Sample listings — not live prices";
  }
  if (liveBookableCount > 0) {
    return `${liveBookableCount} hotel${liveBookableCount === 1 ? "" : "s"} ready to book in Kepi`;
  }
  if (source === "duffel") {
    return "Live hotel rates via Duffel Stays";
  }
  return "Live hotel search via LiteAPI";
}

export function buildHotelSearchProviderBody(input: {
  source: string | null;
  notice?: string | null;
  inventoryNote?: string | null;
}): string {
  if (input.notice?.trim()) return input.notice.trim();
  if (input.inventoryNote?.trim() && input.source === "estimated") return input.inventoryNote.trim();
  if (input.source === "estimated") {
    return "LiteAPI had no bookable rates for these dates. Duffel Stays is still pending on your account — live search runs through LiteAPI and does not require Duffel approval.";
  }
  if (input.source === "liteapi" || input.source === "duffel") {
    return "Live in Kepi = can try checkout here (we verify before payment). Browse on Google / Sample = not bookable in Kepi. Sold-out rates disappear when you tap Book — pick another Live hotel.";
  }
  return "Look for the Live in Kepi badge on each hotel card.";
}
