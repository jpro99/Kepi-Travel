import assert from "node:assert/strict";
import test from "node:test";
import {
  computeJourneyPhase,
  defaultConsumerTabForPhase,
  hasUpcomingTripEvents,
  shouldPromptAirportTransport,
} from "./journeyPhase";

const honoluluTripFlights = [
  {
    id: "1",
    type: "flight",
    localTime: "2026-05-29 08:00",
    timezone: "Pacific/Honolulu",
    flightDate: "2026-05-29",
    flightDepartureTime: "2026-05-29 08:00",
    flightArrivalTime: "2026-05-29 10:00",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "HNL",
    flightNumber: "AS832",
    provider: "Alaska",
  },
];

test("completed Honolulu trip shows post-trip on June 12", () => {
  const nowMs = Date.parse("2026-06-12T12:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
    tripDestination: "HNL",
  });
  assert.equal(phase.kind, "post-trip");
  assert.equal(hasUpcomingTripEvents(honoluluTripFlights, nowMs), false);
});

test("pre-trip within 24h prompts airport transport", () => {
  const nowMs = Date.parse("2026-05-28T12:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(phase.kind, "pre-trip");
  assert.equal(shouldPromptAirportTransport(phase, nowMs), true);
});

test("pre-trip more than a day out hides airport transport prompt", () => {
  const nowMs = Date.parse("2026-05-20T12:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(phase.kind, "pre-trip");
  assert.equal(shouldPromptAirportTransport(phase, nowMs), false);
});

test("multi-leg trip between connections stays pre-trip for next flight", () => {
  const flights = [
    {
      id: "1",
      type: "flight",
      localTime: "2026-06-01 10:00",
      timezone: "Pacific/Honolulu",
      flightDepartureTime: "2026-06-01 10:00",
      flightArrivalTime: "2026-06-01 18:00",
      flightDepartureAirport: "HND",
      flightArrivalAirport: "HNL",
      flightNumber: "HA12",
      provider: "Hawaiian",
    },
    {
      id: "2",
      type: "flight",
      localTime: "2026-06-03 14:00",
      timezone: "Pacific/Honolulu",
      flightDepartureTime: "2026-06-03 14:00",
      flightArrivalTime: "2026-06-03 22:00",
      flightDepartureAirport: "HNL",
      flightArrivalAirport: "ONT",
      flightNumber: "AS456",
      provider: "Alaska",
    },
  ];
  const nowMs = Date.parse("2026-06-02T12:00:00Z");
  const phase = computeJourneyPhase({ reservations: flights, nowMs });
  assert.equal(phase.kind, "pre-trip");
  if (phase.kind === "pre-trip") {
    assert.equal(phase.nextFlight.id, "2");
  }
});

test("defaultConsumerTabForPhase picks flights when departure is within 24h", () => {
  const nowMs = Date.parse("2026-05-29T06:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(defaultConsumerTabForPhase(phase, nowMs), "flights");
});

test("defaultConsumerTabForPhase keeps trip tab when departure is more than a day out", () => {
  const nowMs = Date.parse("2026-05-20T12:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(defaultConsumerTabForPhase(phase, nowMs), "trip");
});
