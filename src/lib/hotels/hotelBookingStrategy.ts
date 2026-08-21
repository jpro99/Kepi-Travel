import { hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";
import type { HotelSearchResult } from "@/lib/hotels/types";
import {
  buildTripFirstBody,
  buildTripFirstHeadline,
} from "@/lib/travelAssistant/tripFirstMessaging";

/** Kepi in-app checkout when within this % of public reference price (default 10%). */
export const HOTEL_KEPI_COMPETITIVE_THRESHOLD = 0.1;

export interface HotelBookingStrategyInput extends Pick<
  HotelSearchResult,
  "totalPrice" | "nights" | "bookOfferId" | "browseOnly" | "referenceTotalUsd" | "referencePriceSource"
> {
  /** Live verified total from prebook — overrides search total when present. */
  verifiedTotalUsd?: number | null;
}

export interface HotelBookingStrategy {
  kepiBookable: boolean;
  /** Google / OTA should be the primary CTA. */
  preferExternal: boolean;
  /** Show Book with Kepi as the main button. */
  kepiPrimary: boolean;
  kepiTotalUsd: number;
  referenceTotalUsd: number | null;
  referenceNightlyUsd: number | null;
  savingsUsd: number | null;
  savingsPercent: number | null;
  compareLine: string | null;
  googlePrimaryLabel: string;
  kepiSecondaryLabel: string;
  cardSelectLabel: string;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolveHotelBookingStrategy(input: HotelBookingStrategyInput): HotelBookingStrategy {
  const nights = Math.max(1, input.nights);
  const kepiBookable = hasKepiBookableLiveRate({
    bookOfferId: input.bookOfferId,
    browseOnly: input.browseOnly,
    // Derived — this input doesn't carry a nightly rate, only the total.
    pricePerNight: input.totalPrice / nights,
  });
  const kepiTotalUsd = roundUsd(input.verifiedTotalUsd ?? input.totalPrice);
  const referenceTotalUsd =
    typeof input.referenceTotalUsd === "number" && input.referenceTotalUsd > 0
      ? roundUsd(input.referenceTotalUsd)
      : null;
  const referenceNightlyUsd = referenceTotalUsd !== null ? roundUsd(referenceTotalUsd / nights) : null;

  let savingsUsd: number | null = null;
  let savingsPercent: number | null = null;
  if (referenceTotalUsd !== null && kepiTotalUsd > referenceTotalUsd) {
    savingsUsd = roundUsd(kepiTotalUsd - referenceTotalUsd);
    savingsPercent = Math.round(((kepiTotalUsd - referenceTotalUsd) / referenceTotalUsd) * 100);
  }

  const withinThreshold =
    referenceTotalUsd !== null &&
    kepiTotalUsd <= referenceTotalUsd * (1 + HOTEL_KEPI_COMPETITIVE_THRESHOLD);

  const preferExternal = !kepiBookable || !withinThreshold;
  const kepiPrimary = kepiBookable && withinThreshold;

  const sourceHint = input.referencePriceSource?.trim();
  const publicPriceLabel =
    referenceNightlyUsd !== null
      ? `~$${Math.round(referenceNightlyUsd)}/night on Google${sourceHint ? ` (${sourceHint})` : ""}`
      : "Compare on Google Hotels";

  let compareLine: string | null = null;
  if (referenceTotalUsd !== null && savingsUsd !== null && savingsUsd >= 1) {
    compareLine = `${publicPriceLabel} · save ~$${Math.round(savingsUsd)} on this stay`;
  } else if (kepiPrimary) {
    compareLine = "Kepi rate is within 10% of public rates — convenient to book here.";
  } else if (kepiBookable) {
    compareLine = `${publicPriceLabel} — we recommend booking there, then forward confirmation to Kepi.`;
  } else {
    compareLine = "Compare on Google Hotels — forward your confirmation to Kepi after you book.";
  }

  const googlePrimaryLabel =
    referenceNightlyUsd !== null
      ? `Check ~$${Math.round(referenceNightlyUsd)}/night on Google ↗`
      : "Check price on Google Hotels ↗";

  const kepiSecondaryLabel = kepiBookable
    ? `Book in Kepi · $${Math.round(kepiTotalUsd)} total`
    : "Book in Kepi";

  const cardSelectLabel = preferExternal
    ? referenceNightlyUsd !== null
      ? `View · ~$${Math.round(referenceNightlyUsd)}/night on Google →`
      : "View · compare on Google →"
    : kepiBookable
      ? "View · book in Kepi →"
      : "View hotel →";

  return {
    kepiBookable,
    preferExternal,
    kepiPrimary,
    kepiTotalUsd,
    referenceTotalUsd,
    referenceNightlyUsd,
    savingsUsd,
    savingsPercent,
    compareLine,
    googlePrimaryLabel,
    kepiSecondaryLabel,
    cardSelectLabel,
  };
}

export function buildHotelTripFirstBannerCopy(): { headline: string; body: string } {
  return {
    headline: buildTripFirstHeadline(),
    body: buildTripFirstBody("hotel"),
  };
}
