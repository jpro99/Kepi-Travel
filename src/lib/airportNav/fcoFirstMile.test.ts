import assert from "node:assert/strict";
import { test } from "node:test";

import { FCO_LAYOUT } from "./layouts/fco";
import {
  buildArrivalTripJourney,
  arrivalJourneyPoiIds,
  layoutSupportsArrivalFirstMile,
  resolveArrivalFirstMileIntl,
  resolveArrivalOriginNode,
} from "./tripJourney";
import { computeRoute } from "./pathfinder";
import { buildArrivalDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";
import {
  resolveCoachModeForPinnedAirport,
  selectFlightForAirportIata,
  type FlightReservation,
} from "@/lib/travelAssistant/useActiveFlight";

test("FCO Schengen domestic (BRI→FCO / AZ1616) still walks passport → bags → customs → Leonardo → Termini", () => {
  const flags = resolveArrivalFirstMileIntl("FCO", "BRI");
  assert.equal(flags.includePassport, true);
  assert.equal(flags.includeCustoms, true);
  const stops = buildArrivalTripJourney(FCO_LAYOUT, { gateCode: "E12", ...flags });
  const poiIds = arrivalJourneyPoiIds(stops);
  assert.ok(poiIds.has("poi-passport-t3"));
  assert.ok(poiIds.has("poi-baggage-t3"));
  assert.ok(poiIds.has("poi-customs-t3"));
  assert.ok(poiIds.has("poi-leonardo-express"));
  assert.ok(poiIds.has("poi-roma-termini"));
});

test("FCO layout supports arrival first mile with passport, bags, customs, Leonardo", () => {
  assert.ok(layoutSupportsArrivalFirstMile(FCO_LAYOUT));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "passport-t3"));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "baggage-t3"));
  assert.ok(FCO_LAYOUT.nodes.some((n) => n.id === "customs-t3"));
  assert.ok(FCO_LAYOUT.pois.some((p) => p.id === "poi-leonardo-express"));
});

test("FCO arrival journey walks gate → passport → bags → customs → Leonardo → Roma Termini", () => {
  const stops = buildArrivalTripJourney(FCO_LAYOUT, { gateCode: "E12" });
  assert.deepEqual(
    stops.map((s) => s.role),
    ["deplane", "passport", "baggage", "customs", "exit", "ground_transport", "ground_transport"],
  );
  assert.equal(stops[0]?.nodeId, "gate-e");
  assert.equal(stops[1]?.poiId, "poi-passport-t3");
  assert.equal(stops[2]?.poiId, "poi-baggage-t3");
  assert.equal(stops[5]?.poiId, "poi-leonardo-express");
  assert.equal(stops[6]?.poiId, "poi-roma-termini");
  assert.equal(stops[6]?.label, "Roma Termini");
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

test("FCO arrival journey POI ids cover passport, bags, customs, Leonardo, Termini chips", () => {
  const stops = buildArrivalTripJourney(FCO_LAYOUT, { gateCode: "E12" });
  const ids = arrivalJourneyPoiIds(stops);
  assert.ok(ids.has("poi-passport-t3"));
  assert.ok(ids.has("poi-baggage-t3"));
  assert.ok(ids.has("poi-customs-t3"));
  assert.ok(ids.has("poi-leonardo-express"));
  assert.ok(ids.has("poi-roma-termini"));
  assert.ok(ids.size >= 5);
});

test("FCO Leonardo POI is station-only label; Roma Termini is separate at Termini", () => {
  const leonardo = FCO_LAYOUT.pois.find((p) => p.id === "poi-leonardo-express");
  const termini = FCO_LAYOUT.pois.find((p) => p.id === "poi-roma-termini");
  assert.equal(leonardo?.name, "Leonardo Express");
  assert.doesNotMatch(leonardo?.name ?? "", /Termini/i);
  assert.equal(termini?.name, "Roma Termini");
  assert.equal(termini?.nodeId, "ground-roma-termini");
});

test("FCO arrival origin defaults to gate-e when gate is TBD (not gate-a)", () => {
  assert.equal(resolveArrivalOriginNode(FCO_LAYOUT, null), "gate-e");
  assert.equal(resolveArrivalOriginNode(FCO_LAYOUT, "E12"), "gate-e");
});

test("FCO gate-e routes to passport and baggage are computable for preview chips", () => {
  const creds = { tsaPreCheck: false, clear: false, known: true };
  const toPassport = computeRoute({
    layout: FCO_LAYOUT,
    fromNodeId: "gate-e",
    toPoiId: "poi-passport-t3",
    credentials: creds,
  });
  const toBags = computeRoute({
    layout: FCO_LAYOUT,
    fromNodeId: "gate-e",
    toPoiId: "poi-baggage-t3",
    credentials: creds,
  });
  assert.ok(toPassport && toPassport.totalSeconds > 0);
  assert.ok(toBags && toBags.totalSeconds > 0);
});

test("FCO gate-e to Roma Termini route uses Leonardo train edge", () => {
  const route = computeRoute({
    layout: FCO_LAYOUT,
    fromNodeId: "gate-e",
    toPoiId: "poi-roma-termini",
    credentials: { tsaPreCheck: false, clear: false, known: true },
  });
  assert.ok(route);
  assert.ok(route!.totalSeconds > 32 * 60);
  assert.ok(route!.instructions.some((step) => step.maneuver === "train_board"));
});

test("FCO arrival journey without gate code still starts at gate-e", () => {
  const stops = buildArrivalTripJourney(FCO_LAYOUT);
  assert.equal(stops[0]?.nodeId, "gate-e");
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
