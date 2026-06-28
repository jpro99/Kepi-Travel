import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";
import { guestTotalForPlan } from "@/lib/hotels/guestPricing";

function stripServerFields<T extends HotelSearchResult>(hotel: T): T {
  const { netTotalPrice: _net, ...rest } = hotel;
  return rest as T;
}

export function applyHotelPricing<T extends HotelSearchResult>(
  hotel: T,
  isMember: boolean,
): T {
  if (hotel.browseOnly || !hotel.bookOfferId) {
    return stripServerFields({
      ...hotel,
      kepiBookable: false,
      memberTotalPrice: undefined,
    });
  }

  const net = hotel.netTotalPrice ?? hotel.totalPrice;
  const memberTotal = guestTotalForPlan(net, true);
  const guestTotal = guestTotalForPlan(net, false);
  const userTotal = isMember ? memberTotal : guestTotal;

  return stripServerFields({
    ...hotel,
    netTotalPrice: net,
    totalPrice: userTotal,
    pricePerNight: userTotal / Math.max(1, hotel.nights),
    memberTotalPrice: isMember ? undefined : memberTotal,
    kepiBookable: true,
  });
}

export function applyHotelPricingList<T extends HotelSearchResult>(
  hotels: T[],
  isMember: boolean,
): T[] {
  return hotels.map((hotel) => applyHotelPricing(hotel, isMember));
}

export function applyRankedHotelPricing(
  hotels: RankedHotelSearchResult[],
  isMember: boolean,
): RankedHotelSearchResult[] {
  return hotels.map((hotel) => applyHotelPricing(hotel, isMember));
}
