import assert from "node:assert/strict";
import test from "node:test";
import {
  filterFlightsDepartingOnDay,
  selectTravelDayDepartureFlight,
  sortFlightsByDeparture,
} from "./flightSort";

test("M39: sortFlightsByDeparture orders ONT before SEA on same day", () => {
  const sorted = sortFlightsByDeparture([
    {
      type: "flight",
      localTime: "2026-09-01 17:30",
      timezone: "America/Los_Angeles",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightNumber: "AS180",
    },
    {
      type: "flight",
      localTime: "2026-09-01 12:00",
      timezone: "America/Los_Angeles",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightNumber: "AS654",
    },
  ]);
  assert.equal(sorted[0]?.flightDepartureAirport, "ONT");
  assert.equal(sorted[1]?.flightDepartureAirport, "SEA");
});

test("M39: selectTravelDayDepartureFlight picks earliest today leg", () => {
  const nowMs = Date.parse("2026-09-01T15:00:00Z"); // morning Pacific
  const pick = selectTravelDayDepartureFlight(
    [
      {
        type: "flight",
        localTime: "2026-09-01 17:30",
        timezone: "America/Los_Angeles",
        flightDepartureAirport: "SEA",
        flightNumber: "AS180",
      },
      {
        type: "flight",
        localTime: "2026-09-01 12:00",
        timezone: "America/Los_Angeles",
        flightDepartureAirport: "ONT",
        flightNumber: "AS654",
      },
      {
        type: "flight",
        localTime: "2026-09-05 10:00",
        timezone: "America/Los_Angeles",
        flightDepartureAirport: "FCO",
        flightNumber: "AS999",
      },
    ],
    nowMs,
  );
  assert.equal(pick?.f.flightDepartureAirport, "ONT");
});

test("M39: filterFlightsDepartingOnDay ignores other days", () => {
  const rows = filterFlightsDepartingOnDay(
    [
      { type: "flight", localTime: "2026-09-01 12:00", flightDepartureAirport: "ONT" },
      { type: "flight", localTime: "2026-09-02 08:00", flightDepartureAirport: "FCO" },
    ],
    "2026-09-01",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.flightDepartureAirport, "ONT");
});
