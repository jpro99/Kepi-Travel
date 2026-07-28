import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectionCalmStatus,
  isTravelDayTakeover,
  shouldShowTerminalExplorePromo,
  TERMINAL_EXPLORE_WINDOW_MS,
} from "@/lib/travelAssistant/homeDayTruth";

test("terminal explore promo only within 48h of departure", () => {
  const now = Date.parse("2026-08-31T12:00:00Z");
  const inWindow = now + 24 * 60 * 60_000;
  const tooSoon = now + TERMINAL_EXPLORE_WINDOW_MS + 60_000;
  assert.equal(shouldShowTerminalExplorePromo(inWindow, now), true);
  assert.equal(shouldShowTerminalExplorePromo(tooSoon, now), false);
  assert.equal(shouldShowTerminalExplorePromo(null, now), false);
});

test("F3: blank inbound arrival is incomplete, not CONNECTION ISSUE", () => {
  const status = buildConnectionCalmStatus([
    {
      id: "as654",
      type: "flight",
      localTime: "2026-09-01 12:00",
      timezone: "America/Los_Angeles",
      confirmationCode: "DPNNWG",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-01 12:00",
      flightArrivalTime: "",
      flightDate: "2026-09-01",
      flightNumber: "AS654",
    },
    {
      id: "as180",
      type: "flight",
      localTime: "2026-09-01 17:30",
      timezone: "America/Los_Angeles",
      confirmationCode: "DPNNWG",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightArrivalTime: "2026-09-02 11:15",
      flightDate: "2026-09-01",
      flightNumber: "AS180",
    },
  ]);
  assert.equal(status.kind, "incomplete");
  assert.match(status.line ?? "", /SEA connection/iu);
  assert.doesNotMatch(status.line ?? "", /needs a quick look/iu);
});

test("real layover times produce calm OK line", () => {
  const status = buildConnectionCalmStatus([
    {
      id: "as654",
      type: "flight",
      localTime: "2026-09-01 12:00",
      timezone: "America/Los_Angeles",
      confirmationCode: "DPNNWG",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-01 12:00",
      flightArrivalTime: "2026-09-01 14:30",
      flightDate: "2026-09-01",
      flightNumber: "AS654",
    },
    {
      id: "as180",
      type: "flight",
      localTime: "2026-09-01 17:30",
      timezone: "America/Los_Angeles",
      confirmationCode: "DPNNWG",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightArrivalTime: "2026-09-02 11:15",
      flightDate: "2026-09-01",
      flightNumber: "AS180",
    },
  ]);
  assert.equal(status.kind, "ok");
  assert.match(status.line ?? "", /SEA connection looks fine/iu);
});

test("travel-day takeover for airborne and openAirportMode", () => {
  assert.equal(
    isTravelDayTakeover({ kind: "airborne", onFlight: {} as never, landingAt: "FCO", landingIn: "2h" }, false),
    true,
  );
  assert.equal(isTravelDayTakeover({ kind: "no-trip" }, true), true);
  assert.equal(isTravelDayTakeover({ kind: "no-trip" }, false), false);
});

test("multi-day same-airport hop is not a calm connection", () => {
  const status = buildConnectionCalmStatus([
    {
      id: "a",
      type: "flight",
      localTime: "2026-09-02 16:40",
      timezone: "Europe/Rome",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightDepartureTime: "2026-09-02 15:35",
      flightArrivalTime: "2026-09-02 16:40",
      flightDate: "2026-09-02",
    },
    {
      id: "b",
      type: "flight",
      localTime: "2026-09-08 10:00",
      timezone: "Europe/Rome",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-08 10:00",
      flightArrivalTime: "2026-09-08 11:10",
      flightDate: "2026-09-08",
    },
  ]);
  assert.equal(status.kind, "none");
  assert.equal(status.line, null);
});
