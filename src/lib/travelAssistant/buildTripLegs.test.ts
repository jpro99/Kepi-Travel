import test from "node:test";
import assert from "node:assert/strict";
import { buildTripLegs, airportToCity } from "@/lib/travelAssistant/buildTripLegs";

test("airportToCity resolves common IATA codes", () => {
  assert.equal(airportToCity("BRI"), "Bari");
  assert.equal(airportToCity("MUC"), "Munich");
  assert.equal(airportToCity("FCO"), "Rome");
  assert.equal(airportToCity("VCE"), "Venice");
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
