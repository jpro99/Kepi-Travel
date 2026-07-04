import test from "node:test";
import assert from "node:assert/strict";
import { buildDayWalkthrough, reservationsForDayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";

const ontToSea = {
  id: "f1",
  type: "flight",
  title: "Alaska 654",
  provider: "Alaska Airlines",
  localTime: "2026-06-14 08:45",
  flightDate: "2026-06-14",
  flightNumber: "AS654",
  flightAirline: "Alaska Airlines",
  flightDepartureAirport: "ONT",
  flightArrivalAirport: "SEA",
  flightDepartureTime: "2026-06-14 08:45",
  flightArrivalTime: "2026-06-14 11:20",
};

const bariArrival = {
  id: "f2",
  type: "flight",
  title: "ITA 1234",
  provider: "ITA Airways",
  localTime: "2026-09-05 14:10",
  flightDate: "2026-09-05",
  flightNumber: "AZ1234",
  flightAirline: "ITA Airways",
  flightDepartureAirport: "FCO",
  flightArrivalAirport: "BRI",
  flightDepartureTime: "2026-09-05 14:10",
  flightArrivalTime: "2026-09-05 15:05",
};

const bariHotel = {
  id: "h1",
  type: "hotel",
  title: "Hotel San Nicola",
  provider: "Hotel San Nicola",
  localTime: "2026-09-05T15:00:00",
  checkOutDate: "2026-09-08",
  location: "Bari, Italy",
};

test("first travel day speaks like a human", () => {
  const walkthrough = buildDayWalkthrough({
    dateKey: "2026-06-14",
    reservations: [ontToSea],
    tripStartDate: "2026-06-14",
    tripEndDate: "2026-09-10",
  });
  assert.equal(walkthrough.headline, "Your first travel day");
  assert.match(walkthrough.paragraphs.join(" "), /Ontario/i);
  assert.match(walkthrough.paragraphs.join(" "), /Seattle/i);
  assert.match(walkthrough.paragraphs.join(" "), /8:45 AM/i);
});

test("arrival day in Bari mentions landing and hotel", () => {
  const walkthrough = buildDayWalkthrough({
    dateKey: "2026-09-05",
    reservations: [bariArrival, bariHotel],
    tripStartDate: "2026-06-14",
    tripEndDate: "2026-09-10",
    stayCity: "Bari",
    dayIndexInLeg: 1,
  });
  assert.match(walkthrough.headline, /Bari/i);
  assert.match(walkthrough.paragraphs.join(" "), /Hotel San Nicola/i);
  assert.match(walkthrough.paragraphs.join(" "), /rest of the day is yours/i);
});

test("open stay day in Bari with hotel only", () => {
  const walkthrough = buildDayWalkthrough({
    dateKey: "2026-09-06",
    reservations: [bariHotel],
    tripStartDate: "2026-06-14",
    tripEndDate: "2026-09-10",
    stayCity: "Bari",
    dayIndexInLeg: 2,
  });
  assert.match(walkthrough.headline, /Day 2 in Bari/i);
  assert.match(walkthrough.paragraphs.join(" "), /open day/i);
});

test("reservationsForDayWalkthrough includes overnight arrivals", () => {
  const overnight = {
    ...ontToSea,
    id: "f-overnight",
    flightDepartureTime: "2026-06-14 22:00",
    flightArrivalTime: "2026-06-15 06:30",
    flightDate: "2026-06-14",
  };
  const onArrivalDay = reservationsForDayWalkthrough("2026-06-15", [overnight]);
  assert.equal(onArrivalDay.length, 1);
});

test("stale flightDate does not attach flight to wrong day", () => {
  const staleMayFlight = {
    ...ontToSea,
    localTime: "2026-09-01 18:00",
    flightDate: "2026-05-29",
    flightDepartureTime: "2026-05-29 18:00",
  };
  const septemberDay = reservationsForDayWalkthrough("2026-09-01", [staleMayFlight]);
  assert.equal(septemberDay.length, 1);
  const mayDay = reservationsForDayWalkthrough("2026-05-29", [staleMayFlight]);
  assert.equal(mayDay.length, 0);
});
