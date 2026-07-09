import assert from "node:assert/strict";
import test from "node:test";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  cacheKeyForAirport,
  extractScheduledAirportNeeds,
  listRemainingAirportIatas,
  shouldPrefetchAsset,
} from "@/lib/travelAssistant/itineraryOfflineCache";

const flight: SessionReservation = {
  id: "f1",
  type: "flight",
  title: "AS 654",
  provider: "Alaska",
  localTime: "2026-09-14 08:45",
  timezone: "America/Los_Angeles",
  location: "ONT",
  confirmationCode: "ABC",
  assignedTo: [],
  stage: "airport",
  critical: true,
  confidence: "high",
  notes: "",
  source: "manual",
  flightNumber: "AS654",
  flightDepartureAirport: "ONT",
  flightArrivalAirport: "SEA",
  flightDepartureTime: "2026-09-14 08:45",
  flightArrivalTime: "2026-09-14 11:20",
};

test("shouldPrefetchAsset opens 48h before airport need time", () => {
  const needs = extractScheduledAirportNeeds([flight]);
  const dep = needs.find((entry) => entry.iata === "ONT");
  assert.ok(dep);
  assert.equal(shouldPrefetchAsset(dep.needByUtcMs, dep.needByUtcMs - 47 * 60 * 60 * 1000), true);
  assert.equal(shouldPrefetchAsset(dep.needByUtcMs, dep.needByUtcMs - 72 * 60 * 60 * 1000), false);
});

test("listRemainingAirportIatas keeps hub for round-trip until final leg passes", () => {
  const roundTrip: SessionReservation[] = [
    flight,
    {
      ...flight,
      id: "f2",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "ONT",
      flightDepartureTime: "2026-10-05 17:30",
      flightArrivalTime: "2026-10-05 20:15",
      localTime: "2026-10-05 17:30",
    },
  ];
  const midTripNow = Date.parse("2026-09-14T12:00:00Z");
  const remaining = listRemainingAirportIatas(roundTrip, midTripNow);
  assert.ok(remaining.has("SEA"));
  assert.ok(remaining.has("ONT"));
  assert.equal(cacheKeyForAirport("SEA"), "airport-layout:SEA");
});
