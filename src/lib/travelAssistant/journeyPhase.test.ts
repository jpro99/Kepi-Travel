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

test("G49: mangled arrival before departure never claims just-landed", () => {
  // AS654 ONT→SEA still hours from departure, but arrival clock is impossible (≤ dep).
  const flight = {
    id: "as654",
    type: "flight",
    localTime: "2026-08-31 07:00",
    timezone: "America/Los_Angeles",
    flightDate: "2026-08-31",
    flightDepartureTime: "2026-08-31 07:00",
    // Same clock as departure — impossible as a real arrival; must not mean "already landed".
    flightArrivalTime: "2026-08-31 07:00",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightNumber: "AS654",
    provider: "Alaska",
  };
  const nowMs = Date.parse("2026-08-31T10:00:00Z"); // 3:00 AM PDT — before 7:00 AM dep
  const phase = computeJourneyPhase({ reservations: [flight], nowMs });
  assert.equal(phase.kind, "pre-trip");
  if (phase.kind === "pre-trip") {
    assert.equal(phase.nextFlight.id, "as654");
  }
});

test("G49: before departure always pre-trip even if arrival string looks past in wrong zone", () => {
  const flight = {
    id: "as654",
    type: "flight",
    localTime: "2026-08-31 07:00",
    timezone: "America/Los_Angeles",
    flightDate: "2026-08-31",
    flightDepartureTime: "2026-08-31 07:00",
    // SEA-local afternoon written without zone; if misread as PDT it can look hours ago.
    flightArrivalTime: "2026-08-30 09:00",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightNumber: "AS654",
  };
  const nowMs = Date.parse("2026-08-31T10:00:00Z"); // still before ONT 7:00 AM dep
  const phase = computeJourneyPhase({ reservations: [flight], nowMs });
  assert.notEqual(phase.kind, "just-landed");
  assert.notEqual(phase.kind, "airborne");
  assert.equal(phase.kind, "pre-trip");
});

test("G65: physical SEA campus vetoes false just-landed at BRI during hub connection", () => {
  const flights = [
    {
      id: "ont-sea",
      type: "flight",
      localTime: "2026-09-01 06:00",
      timezone: "America/Los_Angeles",
      flightDepartureTime: "2026-09-01 06:00",
      flightArrivalTime: "2026-09-01 08:30",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightNumber: "AS654",
    },
    {
      id: "sea-fco",
      type: "flight",
      localTime: "2026-09-01 11:30",
      timezone: "America/Los_Angeles",
      flightDepartureTime: "2026-09-01 11:30",
      flightArrivalTime: "2026-09-02 07:00",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightNumber: "AZ614",
    },
    {
      id: "fco-bri",
      type: "flight",
      localTime: "2026-09-01 08:00",
      timezone: "Europe/Rome",
      flightDepartureTime: "2026-09-01 08:00",
      // Mangled arrival clock — looks hours ago while traveler is still at SEA.
      flightArrivalTime: "2026-09-01 14:00",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightNumber: "AZ1234",
    },
  ];
  // ~10:00 AM PDT at SEA — inbound landed ~90m ago, outbound not yet departed.
  const nowMs = Date.parse("2026-09-01T17:00:00Z");

  const withoutGps = computeJourneyPhase({ reservations: flights, nowMs });
  assert.equal(withoutGps.kind, "just-landed");
  if (withoutGps.kind === "just-landed") {
    assert.equal(withoutGps.flight.id, "fco-bri");
  }

  const atSea = computeJourneyPhase({
    reservations: flights,
    nowMs,
    physicalAirportIata: "SEA",
  });
  assert.equal(atSea.kind, "just-landed");
  if (atSea.kind === "just-landed") {
    assert.equal(atSea.flight.id, "ont-sea");
    assert.notEqual(atSea.flight.flightArrivalAirport, "BRI");
  }
});

test("G65: just-landed at physical campus still works for inbound hub leg", () => {
  const flight = {
    id: "ont-sea",
    type: "flight",
    localTime: "2026-09-01 06:00",
    timezone: "America/Los_Angeles",
    flightDepartureTime: "2026-09-01 06:00",
    flightArrivalTime: "2026-09-01 08:30",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightNumber: "AS654",
  };
  const nowMs = Date.parse("2026-09-01T16:00:00Z"); // ~30m after SEA arrival
  const phase = computeJourneyPhase({
    reservations: [flight],
    nowMs,
    physicalAirportIata: "SEA",
  });
  assert.equal(phase.kind, "just-landed");
  if (phase.kind === "just-landed") {
    assert.equal(phase.flight.id, "ont-sea");
    assert.equal(phase.landedMinutesAgo, 30);
  }
});
