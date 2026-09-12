import assert from "node:assert/strict";
import test from "node:test";
import { computeJourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import {
  formatHubConnectionHeroDetail,
  formatHubConnectionHeroTitle,
  resolveHomeHubConnectionSurface,
} from "@/lib/travelAssistant/hubConnectionHome";

const FCO_VCE_CONNECTION = [
  {
    id: "bri-fco",
    type: "flight",
    localTime: "2026-09-12 12:30",
    timezone: "Europe/Rome",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-12 12:30",
    flightArrivalTime: "2026-09-12 13:45",
    flightDate: "2026-09-12",
    flightNumber: "AZ1607",
    confirmationCode: "Z84T4Z",
  },
  {
    id: "fco-vce",
    type: "flight",
    localTime: "2026-09-12 15:20",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "VCE",
    flightDepartureTime: "2026-09-12 15:20",
    flightArrivalTime: "2026-09-12 18:25",
    flightDate: "2026-09-12",
    flightNumber: "AZ1464",
    confirmationCode: "Z84T4Z",
    flightDepartureGate: "E23",
  },
] as const;

test("G65: tight FCO connection surfaces gate-first hero while on ground", () => {
  const nowMs = Date.parse("2026-09-12T13:10:00.000Z"); // ~15:10 Rome — 10 min to dep
  const phase = computeJourneyPhase({ reservations: [...FCO_VCE_CONNECTION], nowMs });
  const surface = resolveHomeHubConnectionSurface({
    reservations: FCO_VCE_CONNECTION,
    journeyPhase: phase,
    locationStatus: "in-terminal",
    nearestAirport: "FCO",
    nowMs,
  });
  assert.ok(surface, "connection surface should exist at FCO");
  assert.equal(surface!.hubIata, "FCO");
  assert.equal(surface!.outboundReservationId, "fco-vce");
  assert.equal(surface!.onGroundAtHub, true);
  assert.equal(formatHubConnectionHeroTitle(surface!), "Gate E23");
  assert.match(formatHubConnectionHeroDetail(surface!), /Departs in/i);
});

test("G65: after outbound departure, connection surface yields to in-flight landing plan", () => {
  const nowMs = Date.parse("2026-09-12T14:00:00.000Z"); // airborne FCO→VCE
  const phase = computeJourneyPhase({ reservations: [...FCO_VCE_CONNECTION], nowMs });
  assert.equal(phase.kind, "airborne");
  const surface = resolveHomeHubConnectionSurface({
    reservations: FCO_VCE_CONNECTION,
    journeyPhase: phase,
    locationStatus: "airborne",
    nowMs,
  });
  assert.equal(surface, null);
});
