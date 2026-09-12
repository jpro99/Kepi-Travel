import assert from "node:assert/strict";
import test from "node:test";
import {
  findAirborneFlight,
  isFlightAirborneAt,
  isFlightTerminalStatus,
  resolveTravelerLocationStatus,
} from "./flightAirborneState";

const europeFlight = {
  id: "f1",
  type: "flight" as const,
  localTime: "2026-09-12 09:30",
  timezone: "Europe/Rome",
  flightDepartureTime: "2026-09-12 09:30",
  flightArrivalTime: "2026-09-12 11:15",
  flightDepartureAirport: "MXP",
  flightArrivalAirport: "BRI",
};

test("isFlightTerminalStatus recognizes landed and arrived", () => {
  assert.equal(isFlightTerminalStatus("landed"), true);
  assert.equal(isFlightTerminalStatus("Arrived at gate"), true);
  assert.equal(isFlightTerminalStatus("en-route"), false);
});

test("flight is not airborne 5 hours after scheduled arrival", () => {
  const depMs = Date.parse("2026-09-12T07:30:00Z");
  const arrMs = Date.parse("2026-09-12T09:15:00Z");
  const nowMs = arrMs + 5 * 60 * 60_000;
  assert.ok(nowMs > depMs);
  assert.equal(isFlightAirborneAt(europeFlight, nowMs), false);
});

test("flight without arrival time stops being airborne after 5 hours", () => {
  const noArrival = { ...europeFlight, flightArrivalTime: undefined };
  const depMs = Date.parse("2026-09-12T07:30:00Z");
  const nowMs = depMs + 5 * 60 * 60_000 + 1;
  assert.equal(isFlightAirborneAt(noArrival, nowMs), false);
});

test("live landed status overrides in-window airborne time", () => {
  const depMs = Date.parse("2026-09-12T07:30:00Z");
  const nowMs = depMs + 60 * 60_000;
  assert.equal(
    isFlightAirborneAt(europeFlight, nowMs, { liveFlightStatus: "landed" }),
    false,
  );
});

test("GPS on the ground far from airport overrides stale airborne inference", () => {
  const depMs = Date.parse("2026-09-12T07:30:00Z");
  const nowMs = depMs + 90 * 60_000;
  const noArrival = { ...europeFlight, flightArrivalTime: undefined };
  assert.equal(isFlightAirborneAt(noArrival, nowMs), true);

  const status = resolveTravelerLocationStatus({
    flights: [noArrival],
    nowMs,
    userLat: 40.3515,
    userLon: 18.175,
    departureIata: "BRI",
    getProximity: () => ({ status: "away", distanceKm: 42 }),
  });
  assert.equal(status, "away");
});

test("findAirborneFlight returns null when every leg has landed", () => {
  const nowMs = Date.parse("2026-09-12T16:00:00Z");
  const landed = findAirborneFlight([europeFlight], nowMs);
  assert.equal(landed, null);
});

test("mangled future arrival time cannot keep flight airborne past 5h after departure", () => {
  const mangled = {
    ...europeFlight,
    flightArrivalTime: "2026-09-13 11:15",
  };
  const depMs = Date.parse("2026-09-12T07:30:00Z");
  const nowMs = depMs + 5 * 60 * 60_000 + 1;
  assert.equal(isFlightAirborneAt(mangled, nowMs), false);
});
