import assert from "node:assert/strict";
import { test } from "node:test";

import { FCO_LAYOUT } from "./layouts/fco";
import {
  buildArrivalTripJourney,
  layoutSupportsArrivalFirstMile,
} from "./tripJourney";
import { computeRoute } from "./pathfinder";
import { buildArrivalDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";
import {
  resolveCoachModeForPinnedAirport,
  selectFlightForAirportIata,
  type FlightReservation,
} from "@/lib/travelAssistant/useActiveFlight";

test("FCO layout supports arrival first mile with passport, bags, customs, Leonardo", () => {
  assert.ok(layoutSupportsArrivalFirstMile(FCO_LAYOUT));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "passport-t3"));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "baggage-t3"));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "customs-t3"));
  assert.ok(FCO_LAYOUT.pois.some((p) => p.id === "poi-leonardo-express"));
});

test("FCO arrival journey walks gate → passport → bags → customs → Leonardo", () => {
  const stops = buildArrivalTripJourney(FCO_LAYOUT, { gateCode: "E12" });
  assert.deepEqual(
    stops.map((s) => s.role),
    ["deplane", "passport", "baggage", "customs", "exit", "ground_transport"],
  );
  assert.equal(stops[0]?.nodeId, "gate-e");
  assert.equal(stops[1]?.poiId, "poi-passport-t3");
  assert.equal(stops[2]?.poiId, "poi-baggage-t3");
  assert.equal(stops[5]?.poiId, "poi-leonardo-express");
});

test("FCO arrival coach path includes walk minutes along the graph", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    flightNumber: "AS180",
    departureIata: "SEA",
    arrivalGate: "E12",
    flightArrivalTime: "2026-09-02 14:30",
    flightTimezone: "Europe/Rome",
  });
  const ids = steps.map((s) => s.id);
  assert.ok(ids.includes("immigration"));
  assert.ok(ids.includes("bags"));
  assert.ok(ids.includes("customs"));
  assert.ok(ids.includes("ride"));
  const passport = steps.find((s) => s.id === "immigration");
  const bags = steps.find((s) => s.id === "bags");
  assert.ok((passport?.minutes ?? 0) >= 1, "passport leg has walk minutes");
  assert.ok((bags?.minutes ?? 0) >= 1, "baggage leg has walk minutes");
  assert.match(steps.find((s) => s.id === "ride")?.text ?? "", /Leonardo Express/i);
});

test("FCO gate-e to Leonardo route is computable along arrival graph", () => {
  const route = computeRoute({
    layout: FCO_LAYOUT,
    fromNodeId: "gate-e",
    toPoiId: "poi-leonardo-express",
    credentials: { tsaPreCheck: false, clear: false, known: true },
  });
  assert.ok(route);
  assert.ok(route!.totalSeconds > 0);
});

test("FCO arrive mode pins inbound AS180 when AZ1607 FCO→BRI is on the same trip", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  const flights: FlightReservation[] = [
    {
      id: "as180",
      type: "flight",
      title: "AS 180",
      provider: "Alaska",
      localTime: "2026-09-01 17:30",
      location: "SEA",
      flightNumber: "AS180",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightArrivalTime: "2026-09-02 14:30",
    },
    {
      id: "az1607",
      type: "flight",
      title: "AZ 1607",
      provider: "ITA Airways",
      localTime: "2026-09-05 10:00",
      location: "FCO",
      flightNumber: "AZ1607",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightDepartureTime: "2026-09-05 10:00",
      flightArrivalTime: "2026-09-05 11:00",
    },
  ];
  const pinned = selectFlightForAirportIata(flights, "FCO", now, "arrive");
  assert.equal(pinned?.f.id, "as180");
  assert.equal(resolveCoachModeForPinnedAirport(pinned!.f, "FCO", "arrive"), "arrive");
});
