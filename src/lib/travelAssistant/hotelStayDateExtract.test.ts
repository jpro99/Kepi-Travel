import assert from "node:assert/strict";
import test from "node:test";
import {
  collectExplicitYearsFromText,
  extractHotelAddressLocation,
  extractLabeledHotelStayDates,
  resolveYearForMonthDay,
} from "@/lib/travelAssistant/hotelStayDateExtract";

const airbnbVeniceEmail = `
Reservation confirmed
Cosy, Romantic & Stylish Studio
Entire home/apt hosted by Alessia
Check-in
Sat, Sep 12
After 3:00 PM
Checkout
Tue, Sep 15
By 10:00 AM
Address
Rio dei Miracoli, 30121 Venice, Veneto, Italy
Guests
2 adults
House rules
2 guests maximum
No pets
Cancellation policy
Free cancellation before 3:00 PM on Sep 7
Scheduled payment
Aug 29, 2026
You will be charged a total of $736.44. Payment is scheduled for Aug 29, 2026 with Mastercard 8881.
`;

test("I39: year hints collect 2026 from Airbnb payment line", () => {
  assert.deepEqual(collectExplicitYearsFromText(airbnbVeniceEmail), [2026]);
});

test("I39: resolveYearForMonthDay prefers email year over inventing", () => {
  const year = resolveYearForMonthDay(9, 12, [2026], new Date("2026-07-29T12:00:00Z"));
  assert.equal(year, 2026);
});

test("I39: Airbnb yearless Check-in/Checkout cards → Sep 12–15 2026", () => {
  const stay = extractLabeledHotelStayDates(airbnbVeniceEmail, new Date("2026-07-29T12:00:00Z"));
  assert.ok(stay);
  assert.equal(stay!.checkInLocalTime, "2026-09-12 15:00");
  assert.equal(stay!.checkOutDate, "2026-09-15");
});

test("I39: Airbnb Address line yields Venice city", () => {
  assert.equal(extractHotelAddressLocation(airbnbVeniceEmail), "Venice");
});

test("I39: Booking.com yearful check-in/out still works via labeled extract", () => {
  const body = `
You're confirmed at Casa de Elena
Check-in: Saturday, September 6, 2026 from 15:00
Check-out: Tuesday, September 9, 2026 until 11:00
Polignano a Mare, Italy
`;
  const stay = extractLabeledHotelStayDates(body, new Date("2026-07-29T12:00:00Z"));
  assert.ok(stay);
  assert.equal(stay!.checkInLocalTime.slice(0, 10), "2026-09-06");
  assert.equal(stay!.checkOutDate, "2026-09-09");
});
