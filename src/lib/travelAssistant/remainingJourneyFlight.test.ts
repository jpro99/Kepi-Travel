import assert from "node:assert/strict";
import test from "node:test";
import {
  isFcoArriveRemainingJourney,
  selectActiveArrivalFlight,
  selectRemainingJourneyFlight,
} from "@/lib/travelAssistant/remainingJourneyFlight";
import { selectNextRemainingFlight } from "@/lib/travelAssistant/flightSort";

const EUROPE = [
  {
    id: "as654",
    type: "flight",
    localTime: "2026-09-01 12:50",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightDepartureTime: "2026-09-01 12:50",
    flightNumber: "AS654",
    flightDate: "2026-09-01",
  },
  {
    id: "as180",
    type: "flight",
    localTime: "2026-09-01 17:30",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-02 14:30",
    flightNumber: "AS180",
    flightDate: "2026-09-01",
  },
  {
    id: "az1607",
    type: "flight",
    localTime: "2026-09-05 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "BRI",
    flightDepartureTime: "2026-09-05 10:00",
    flightArrivalTime: "2026-09-05 11:00",
    flightNumber: "AZ1607",
    flightDate: "2026-09-05",
  },
] as const;

test("F15 remaining-pick still prefers ONT before SEA long-haul", () => {
  const nowMs = Date.parse("2026-09-01T15:00:00Z");
  assert.equal(selectNextRemainingFlight([...EUROPE], nowMs)?.id, "as654");
});

test("FCO arrive window pins AS180 even when AZ1607 is stored later", () => {
  const landedAtFco = Date.parse("2026-09-02T13:00:00Z");
  const arrival = selectActiveArrivalFlight([...EUROPE], landedAtFco);
  assert.equal(arrival?.id, "as180");
  const remaining = selectRemainingJourneyFlight([...EUROPE], landedAtFco);
  assert.equal(remaining?.id, "as180");
  assert.ok(isFcoArriveRemainingJourney(remaining));
});

test("empty flightArrivalTime never opens synthetic arrive window (AS654)", () => {
  const as654 = {
    ...EUROPE[0],
    flightArrivalTime: "",
  };
  const afterWouldBeFakeLanding = Date.parse("2026-09-02T01:00:00Z");
  assert.equal(selectActiveArrivalFlight([as654], afterWouldBeFakeLanding), null);
  assert.equal(selectRemainingJourneyFlight([as654], afterWouldBeFakeLanding)?.id, "as654");
  assert.equal(as654.flightArrivalTime, "");
});

test("flightArrivalUtcMs path rejects impossible arrival clock (arrival ≤ departure)", () => {
  const badClock = {
    id: "bad",
    type: "flight",
    localTime: "2026-09-01 17:30",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-01 08:00",
    flightNumber: "AS180",
    flightDate: "2026-09-01",
  };
  const duringBad = Date.parse("2026-09-01T20:00:00Z");
  assert.equal(selectActiveArrivalFlight([badClock], duringBad), null);
});

test("after FCO arrive window, remaining-pick returns next departure not stale arrival", () => {
  const afterArrive = Date.parse("2026-09-02T22:00:00Z");
  const remaining = selectRemainingJourneyFlight([...EUROPE], afterArrive);
  assert.equal(remaining?.id, "az1607");
});
