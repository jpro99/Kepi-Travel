import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripLegs,
  airportToCity,
  countNights,
  dedupeFlights,
} from "@/lib/travelAssistant/buildTripLegs";

test("airportToCity resolves common IATA codes", () => {
  assert.equal(airportToCity("BRI"), "Bari");
  assert.equal(airportToCity("MUC"), "Munich");
  assert.equal(airportToCity("FCO"), "Rome");
  assert.equal(airportToCity("VCE"), "Venice");
});

test("countNights uses checkout minus check-in (not inclusive day count)", () => {
  assert.equal(countNights("2026-09-12", "2026-09-24"), 12);
  assert.equal(countNights("2026-09-02", "2026-09-11"), 9);
  assert.equal(countNights("2026-09-01", "2026-09-01"), 1);
});

test("dedupeFlights removes identical flightNumber + departureTime", () => {
  const flights = dedupeFlights([
    {
      id: "a",
      flightNumber: "AS 654",
      flightDepartureTime: "2026-09-01 08:00",
      localTime: "2026-09-01 08:00",
    },
    {
      id: "b",
      flightNumber: "AS 654",
      flightDepartureTime: "2026-09-01 08:00",
      localTime: "2026-09-01 08:00",
    },
    {
      id: "c",
      flightNumber: "AS 180",
      flightDepartureTime: "2026-09-01 11:00",
      localTime: "2026-09-01 11:00",
    },
  ]);
  assert.equal(flights.length, 2);
  assert.equal(flights[0]!.id, "a");
  assert.equal(flights[1]!.id, "c");
});

test("buildTripLegs creates travel and stay legs from flight gaps", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "Outbound",
        provider: "Alaska",
        localTime: "2026-09-01 08:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 08:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "To Bari",
        provider: "ITA",
        localTime: "2026-09-02 14:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
      },
      {
        id: "f3",
        type: "flight",
        title: "Return",
        provider: "LH",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "ONT",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  const travel = legs.filter((l) => l.type === "travel");
  const stays = legs.filter((l) => l.type === "stay");
  assert.ok(travel.length >= 2);
  assert.ok(stays.length >= 1);
  assert.ok(stays.some((s) => s.label === "Bari" || s.label.includes("Bari")));
});
