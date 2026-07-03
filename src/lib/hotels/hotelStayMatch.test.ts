import test from "node:test";
import assert from "node:assert/strict";
import {
  hotelReservationMatchesCity,
  normalizeCityKey,
  resolveHotelForStaySegment,
} from "@/lib/hotels/hotelStayMatch";

test("normalizeCityKey strips IATA and country", () => {
  assert.equal(normalizeCityKey("Monopoli (BRI), Italy"), "monopoli");
});

test("hotelReservationMatchesCity uses hotelSearchCity", () => {
  const match = hotelReservationMatchesCity(
    {
      id: "h1",
      title: "Hyatt Centric",
      location: "Via Example 1",
      hotelSearchCity: "Monopoli, Italy",
    },
    "Monopoli (BRI)",
  );
  assert.equal(match, true);
});

test("resolveHotelForStaySegment marks booked on overlapping dates", () => {
  const result = resolveHotelForStaySegment(
    { city: "Monopoli, Italy", checkIn: "2027-06-10", checkOut: "2027-06-20" },
    [
      {
        id: "h1",
        title: "Hyatt Centric Monopoli",
        location: "Monopoli, Italy",
        localTime: "2027-06-12T15:00:00",
        checkOutDate: "2027-06-18",
        hotelSearchCity: "Monopoli, Italy",
      },
    ],
  );
  assert.equal(result.status, "booked");
  assert.equal(result.reservationId, "h1");
});
