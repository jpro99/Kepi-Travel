import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveHotelSearchCityFromReservation,
  enrichHotelReservationForMatching,
  singleStayHotelFallback,
} from "@/lib/hotels/hotelReservationCity";
import { hotelReservationMatchesCity } from "@/lib/hotels/hotelStayMatch";

test("deriveHotelSearchCityFromReservation reads city from title", () => {
  assert.equal(
    deriveHotelSearchCityFromReservation({
      id: "h1",
      title: "Hyatt Centric Monopoli",
      location: "Via Example 1",
    }),
    "Monopoli",
  );
});

test("single stay fallback matches lone hotel to lone city", () => {
  const hotel = enrichHotelReservationForMatching({
    id: "h1",
    title: "Hyatt Centric Monopoli",
    location: "Via Example 1",
    localTime: "2027-06-12T15:00:00",
    checkOutDate: "2027-06-18",
  });
  assert.ok(hotelReservationMatchesCity(hotel, "Monopoli, Italy"));
  assert.equal(singleStayHotelFallback([hotel], 1)?.id, "h1");
});
