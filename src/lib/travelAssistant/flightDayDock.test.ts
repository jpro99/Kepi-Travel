import assert from "node:assert/strict";
import test from "node:test";
import { computeJourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { BARI_VENICE_SEP_12_RESERVATIONS } from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  buildFlightDayDockModel,
  selectFlightDayDockFlight,
  shouldPinFlightDayDock,
} from "@/lib/travelAssistant/flightDayDock";
import { selectActiveFlight, type FlightReservation } from "@/lib/travelAssistant/useActiveFlight";
import { resolveAirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";
import { flightArrivalUtcMs } from "@/lib/travelAssistant/remainingJourneyFlight";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";

const bariFlight = BARI_VENICE_SEP_12_RESERVATIONS.find((r) => r.id === "flight-bri-vce")!;

test("G64: flight dock pins BRI→VCE on Sep 12 travel morning", () => {
  const nowMs = Date.parse("2026-09-12T08:00:00.000Z"); // 10:00 Europe/Rome
  const phase = computeJourneyPhase({
    reservations: [...BARI_VENICE_SEP_12_RESERVATIONS],
    nowMs,
  });
  const flight = selectFlightDayDockFlight(BARI_VENICE_SEP_12_RESERVATIONS, phase, nowMs);
  assert.equal(flight?.id, "flight-bri-vce");
  assert.equal(shouldPinFlightDayDock(flight, phase, nowMs), true);
  const model = buildFlightDayDockModel(flight!, phase, undefined, nowMs);
  assert.match(model.title, /BRI.*VCE|Z84T4Z/i);
});

test("G64: selectActiveFlight stays active in-flight after 60m post-departure", () => {
  const flight = bariFlight as FlightReservation;
  const depMs = flightDepartureUtcMs(flight);
  const arrMs = flightArrivalUtcMs(flight);
  assert.ok(!Number.isNaN(depMs) && !Number.isNaN(arrMs));
  const midAirMs = depMs + 90 * 60_000;
  assert.ok(midAirMs < arrMs);
  const active = selectActiveFlight([flight], midAirMs);
  assert.ok(active, "in-flight leg must stay in active window until arrival");
  assert.equal(active!.f.id, "flight-bri-vce");
});

test("G64: airport location phase stays departed in-flight, not off", () => {
  const flight = bariFlight as FlightReservation;
  const depMs = flightDepartureUtcMs(flight);
  const arrMs = flightArrivalUtcMs(flight);
  const midAirMs = depMs + 90 * 60_000;
  const phase = resolveAirportLocationPhase({
    departureUtcMs: depMs,
    arrivalUtcMs: arrMs,
    nowMs: midAirMs,
    locationStatus: "airborne",
  });
  assert.equal(phase, "departed");
});

test("G64: airborne journey pins dock with landing copy", () => {
  const nowMs = Date.parse("2026-09-12T14:30:00.000Z");
  const phase = computeJourneyPhase({
    reservations: [...BARI_VENICE_SEP_12_RESERVATIONS],
    nowMs,
  });
  assert.equal(phase.kind, "airborne");
  const flight = selectFlightDayDockFlight(BARI_VENICE_SEP_12_RESERVATIONS, phase, nowMs);
  assert.equal(flight?.id, "flight-bri-vce");
  const model = buildFlightDayDockModel(flight!, phase, undefined, nowMs);
  assert.match(model.eyebrow, /In flight/i);
  assert.match(model.ctaLabel, /VCE/i);
});
