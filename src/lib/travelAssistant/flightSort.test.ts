import assert from "node:assert/strict";
import test from "node:test";
import {
  filterFlightsDepartingOnDay,
  selectNextRemainingFlight,
  selectTravelDayDepartureFlight,
  sortFlightsByDeparture,
} from "./flightSort";
import { buildMissionControlSnapshot } from "./tripPhase";

const EUROPE_OUTBOUND_STORE_ORDER = [
  {
    id: "as180",
    type: "flight",
    title: "Alaska AS 180",
    provider: "Alaska Airlines",
    localTime: "2026-09-01 17:30",
    timezone: "Etc/UTC",
    confirmationCode: "DPNNWG",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-02 11:15",
    flightDate: "2026-09-01",
    flightNumber: "AS180",
  },
  {
    id: "as654",
    type: "flight",
    title: "Alaska AS 654",
    provider: "Alaska Airlines",
    localTime: "2026-09-01 12:50",
    timezone: "America/Los_Angeles",
    confirmationCode: "DPNNWG",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightDepartureTime: "2026-09-01 12:50",
    flightArrivalTime: "",
    flightDate: "2026-09-01",
    flightNumber: "AS654",
  },
] as const;

test("F15: storage order long-haul first — sort still puts ONT→SEA before SEA→FCO", () => {
  const sorted = sortFlightsByDeparture([...EUROPE_OUTBOUND_STORE_ORDER]);
  assert.equal(sorted[0]?.id, "as654");
  assert.equal(sorted[1]?.id, "as180");
});

test("F15: selectNextRemainingFlight picks ONT connector before SEA long-haul", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const next = selectNextRemainingFlight([...EUROPE_OUTBOUND_STORE_ORDER], nowMs);
  assert.equal(next?.id, "as654");
  assert.equal(next?.flightDepartureAirport, "ONT");
});

test("F15: after ONT departs, next remaining is SEA→FCO", () => {
  const afterOnt = Date.parse("2026-09-01T22:00:00Z");
  const next = selectNextRemainingFlight([...EUROPE_OUTBOUND_STORE_ORDER], afterOnt);
  assert.equal(next?.id, "as180");
  assert.equal(next?.flightDepartureAirport, "SEA");
});

test("F15: mission control nextFlight uses departure clock not storage order", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      reservations: [...EUROPE_OUTBOUND_STORE_ORDER],
    },
    nowMs,
  );
  assert.equal(snap.nextFlight?.id, "as654");
  assert.equal(snap.nextFlight?.flightDepartureAirport, "ONT");
});

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
