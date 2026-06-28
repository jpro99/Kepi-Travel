import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { resolveGuestPriceQuote } from "@/lib/hotels/guestPricing";
import { generateId } from "@/lib/utils/generateId";

const ANALYTICS_PREFIX = "hotel-booking-analytics";
const ANALYTICS_INDEX_KEY = `${ANALYTICS_PREFIX}/index`;
const STRIPE_FEE_RATE = 0.029;
const STRIPE_FEE_FIXED_USD = 0.3;

export interface HotelBookingAnalyticsRecord {
  id: string;
  userId: string;
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  netTotalUsd: number;
  guestTotalUsd: number;
  markupUsd: number;
  isMemberRate: boolean;
  estimatedStripeFeeUsd: number;
  estimatedKepiMarginUsd: number;
  bookingReference?: string;
  createdAt: string;
}

function estimateStripeFeeUsd(guestTotalUsd: number): number {
  return Math.round((guestTotalUsd * STRIPE_FEE_RATE + STRIPE_FEE_FIXED_USD) * 100) / 100;
}

export async function recordHotelBookingAnalytics(input: {
  userId: string;
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  netTotalUsd: number;
  guestTotalUsd: number;
  isMemberRate: boolean;
  bookingReference?: string;
}): Promise<HotelBookingAnalyticsRecord> {
  const quote = resolveGuestPriceQuote(input.netTotalUsd, input.isMemberRate);
  const stripeFee = estimateStripeFeeUsd(input.guestTotalUsd);
  const kepiMargin = Math.round((input.guestTotalUsd - input.netTotalUsd - stripeFee) * 100) / 100;

  const record: HotelBookingAnalyticsRecord = {
    id: generateId(),
    userId: input.userId,
    hotelName: input.hotelName,
    city: input.city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    netTotalUsd: input.netTotalUsd,
    guestTotalUsd: input.guestTotalUsd,
    markupUsd: quote.markupUsd,
    isMemberRate: input.isMemberRate,
    estimatedStripeFeeUsd: stripeFee,
    estimatedKepiMarginUsd: kepiMargin,
    bookingReference: input.bookingReference,
    createdAt: new Date().toISOString(),
  };

  await kvStoreSet(`${ANALYTICS_PREFIX}/${record.id}`, record, { userId: "__hotel-analytics__" });

  const index = (await kvStoreGet<string[]>(ANALYTICS_INDEX_KEY, { userId: "__hotel-analytics__" })) ?? [];
  const nextIndex = [record.id, ...index.filter((id) => id !== record.id)].slice(0, 200);
  await kvStoreSet(ANALYTICS_INDEX_KEY, nextIndex, { userId: "__hotel-analytics__" });

  return record;
}

export async function listRecentHotelBookingAnalytics(limit = 25): Promise<HotelBookingAnalyticsRecord[]> {
  const index = (await kvStoreGet<string[]>(ANALYTICS_INDEX_KEY, { userId: "__hotel-analytics__" })) ?? [];
  const records: HotelBookingAnalyticsRecord[] = [];
  for (const id of index.slice(0, limit)) {
    const record = await kvStoreGet<HotelBookingAnalyticsRecord>(`${ANALYTICS_PREFIX}/${id}`, {
      userId: "__hotel-analytics__",
    });
    if (record) records.push(record);
  }
  return records;
}

export function summarizeHotelBookingAnalytics(records: HotelBookingAnalyticsRecord[]): {
  bookingCount: number;
  grossGuestUsd: number;
  netWholesaleUsd: number;
  markupUsd: number;
  estimatedStripeFeesUsd: number;
  estimatedKepiMarginUsd: number;
  memberBookings: number;
  freeBookings: number;
} {
  let grossGuestUsd = 0;
  let netWholesaleUsd = 0;
  let markupUsd = 0;
  let estimatedStripeFeesUsd = 0;
  let estimatedKepiMarginUsd = 0;
  let memberBookings = 0;
  let freeBookings = 0;

  for (const record of records) {
    grossGuestUsd += record.guestTotalUsd;
    netWholesaleUsd += record.netTotalUsd;
    markupUsd += record.markupUsd;
    estimatedStripeFeesUsd += record.estimatedStripeFeeUsd;
    estimatedKepiMarginUsd += record.estimatedKepiMarginUsd;
    if (record.isMemberRate) memberBookings += 1;
    else freeBookings += 1;
  }

  return {
    bookingCount: records.length,
    grossGuestUsd: Math.round(grossGuestUsd * 100) / 100,
    netWholesaleUsd: Math.round(netWholesaleUsd * 100) / 100,
    markupUsd: Math.round(markupUsd * 100) / 100,
    estimatedStripeFeesUsd: Math.round(estimatedStripeFeesUsd * 100) / 100,
    estimatedKepiMarginUsd: Math.round(estimatedKepiMarginUsd * 100) / 100,
    memberBookings,
    freeBookings,
  };
}
