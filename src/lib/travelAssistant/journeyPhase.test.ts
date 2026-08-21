import assert from "node:assert/strict";
import test from "node:test";
import {
  computeJourneyPhase,
  defaultConsumerTabForPhase,
  hasUpcomingTripEvents,
  shouldPromptAirportTransport,
  toUtcMs,
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

test("defaultConsumerTabForPhase picks book when departure is within 24h", () => {
  const nowMs = Date.parse("2026-05-29T06:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(defaultConsumerTabForPhase(phase, nowMs), "book");
});

test("defaultConsumerTabForPhase keeps trip tab when departure is more than a day out", () => {
  const nowMs = Date.parse("2026-05-20T12:00:00Z");
  const phase = computeJourneyPhase({
    reservations: honoluluTripFlights,
    nowMs,
  });
  assert.equal(defaultConsumerTabForPhase(phase, nowMs), "trip");
});

// --- LAX -> FCO arrival-timezone regression (arrival must use the ARRIVAL airport's
// timezone, not flight.timezone which the parser always sets to the DEPARTURE tz). ---

// Departs LAX 2026-06-10 21:00 America/Los_Angeles (PDT, UTC-7 in June).
// Manual IANA offset math: 2026-06-10T21:00:00-07:00 == 2026-06-11T04:00:00Z.
const laxFcoDepartureUtcMs = Date.parse("2026-06-11T04:00:00Z");
// States an explicit FCO-local arrival: 2026-06-11 16:00 Europe/Rome (CEST, UTC+2 in June).
// Manual IANA offset math: 2026-06-11T16:00:00+02:00 == 2026-06-11T14:00:00Z.
const laxFcoCorrectArrivalUtcMs = Date.parse("2026-06-11T14:00:00Z");
// What the pre-fix code computed: it ran the FCO-local clock time through flight.timezone
// (America/Los_Angeles, the DEPARTURE tz) instead of Europe/Rome.
// Manual IANA offset math: 2026-06-11T16:00:00-07:00 == 2026-06-11T23:00:00Z.
const laxFcoBuggyArrivalUtcMs = Date.parse("2026-06-11T23:00:00Z");

const laxFcoFlightWithStatedArrival = {
  id: "1",
  type: "flight",
  localTime: "2026-06-10 21:00",
  timezone: "America/Los_Angeles",
  flightDate: "2026-06-10",
  flightDepartureTime: "2026-06-10 21:00",
  flightArrivalTime: "2026-06-11 16:00",
  flightDepartureAirport: "LAX",
  flightArrivalAirport: "FCO",
  flightNumber: "AZ614",
  provider: "ITA Airways",
};

test("toUtcMs independently confirms the LAX/FCO manual offset math used below", () => {
  // Departure-local reading, interpreted in the departure (LAX) timezone.
  assert.equal(toUtcMs("2026-06-10 21:00", "America/Los_Angeles"), laxFcoDepartureUtcMs);
  // Arrival-local reading, interpreted in the correct arrival (FCO) timezone.
  assert.equal(toUtcMs("2026-06-11 16:00", "Europe/Rome"), laxFcoCorrectArrivalUtcMs);
  // Same arrival-local reading, interpreted in the (wrong) departure timezone — this is
  // the bug: it lands ~9 hours later than the real arrival instant.
  assert.equal(toUtcMs("2026-06-11 16:00", "America/Los_Angeles"), laxFcoBuggyArrivalUtcMs);
});

test("LAX->FCO with a stated arrival time reports just-landed at the correct FCO-local instant, not the buggy departure-tz instant", () => {
  // Two minutes after the CORRECT arrival instant (Europe/Rome-resolved).
  const nowMsAtCorrectArrival = laxFcoCorrectArrivalUtcMs + 2 * 60 * 1000;
  const phase = computeJourneyPhase({
    reservations: [laxFcoFlightWithStatedArrival],
    nowMs: nowMsAtCorrectArrival,
  });
  // Pre-fix, this same nowMs would fall inside [depMs, buggyArrMs) and read "airborne"
  // (the plane would appear to still be over the Atlantic ~9 hours after it actually landed).
  assert.equal(phase.kind, "just-landed");
  if (phase.kind === "just-landed") {
    assert.equal(phase.landedMinutesAgo, 2);
  }

  // Confirm the buggy instant is still mid-flight per the correct clock (sanity check that
  // the two instants are meaningfully different, i.e. this test actually exercises the bug).
  assert.ok(laxFcoBuggyArrivalUtcMs > laxFcoCorrectArrivalUtcMs);
});

test("LAX->FCO WITHOUT a stated arrival time keeps the existing +4h fallback behavior (airborne well before a long-haul really lands)", () => {
  const flightNoArrivalStated = {
    ...laxFcoFlightWithStatedArrival,
    flightArrivalTime: undefined,
  };
  // A few hours after departure — a real LAX-FCO flight (~11-12h) is still mid-flight here,
  // and the +4h fallback (unchanged by this fix) should still call it "airborne", not
  // "just-landed".
  const nowMsAFewHoursOut = laxFcoDepartureUtcMs + 2 * 60 * 60 * 1000;
  const phaseFewHoursOut = computeJourneyPhase({
    reservations: [flightNoArrivalStated],
    nowMs: nowMsAFewHoursOut,
  });
  assert.equal(phaseFewHoursOut.kind, "airborne");

  // Just past the +4h fallback mark, the existing (documented, unchanged) fallback flips
  // to just-landed — this locks in that the fallback itself was not touched by this fix.
  const nowMsPastFallback = laxFcoDepartureUtcMs + 4 * 60 * 60 * 1000 + 60 * 1000;
  const phasePastFallback = computeJourneyPhase({
    reservations: [flightNoArrivalStated],
    nowMs: nowMsPastFallback,
  });
  assert.equal(phasePastFallback.kind, "just-landed");
});
