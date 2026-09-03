import assert from "node:assert/strict";
import test from "node:test";
import { FCO_LAYOUT } from "@/lib/airportNav/layouts/fco";
import {
  detectBookedGateStringChange,
  gateCoachCopy,
  matchesRemainingGateStation,
  resolveBookedGateDot,
} from "@/lib/travelAssistant/bookedRemainingGateStation";

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
] as const;

test("detectBookedGateStringChange requires both sides and a real difference", () => {
  assert.deepEqual(detectBookedGateStringChange("C12", "B4"), { from: "C12", to: "B4" });
  assert.equal(detectBookedGateStringChange("", "B4"), null);
  assert.equal(detectBookedGateStringChange("C12", ""), null);
  assert.equal(detectBookedGateStringChange("C12", "c12"), null);
});

test("resolveBookedGateDot uses gateNodeResolver longest-prefix — no match = no DOT", () => {
  assert.deepEqual(resolveBookedGateDot(FCO_LAYOUT, "E12"), {
    nodeId: "gate-e",
    gateString: "E12",
  });
  assert.equal(resolveBookedGateDot(FCO_LAYOUT, "ZZ99"), null);
});

test("unmatched gate string yields coach copy, not a map dot", () => {
  const copy = gateCoachCopy("ZZ99", FCO_LAYOUT);
  assert.ok(copy);
  assert.match(copy!, /map pin unavailable/i);
});

test("matchesRemainingGateStation is true only for the booked remaining flight", () => {
  const nowMs = Date.parse("2026-09-01T15:00:00Z");
  assert.equal(
    matchesRemainingGateStation(EUROPE, { flightNumber: "AS654", flightDate: "2026-09-01" }, nowMs),
    true,
  );
  assert.equal(
    matchesRemainingGateStation(EUROPE, { flightNumber: "AS180", flightDate: "2026-09-01" }, nowMs),
    false,
  );
});
