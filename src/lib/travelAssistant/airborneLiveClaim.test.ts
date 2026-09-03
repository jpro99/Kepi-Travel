import assert from "node:assert/strict";
import test from "node:test";
import {
  hasVerifiedLiveAirborneStatus,
  resolveAirborneHeroCopy,
} from "@/lib/travelAssistant/airborneLiveClaim";
import {
  resolveBookedArrivalLocalTime,
} from "@/lib/travelAssistant/bookedFlightArrival";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

/** Live DPNNWG AS654 — storage order from flightSort.test.ts (arrival not on reservation). */
const LIVE_AS654_ON_FLIGHT = {
  id: "as654",
  type: "flight",
  localTime: "2026-09-01 12:50",
  timezone: "America/Los_Angeles",
  flightDate: "2026-09-01",
  flightDepartureTime: "2026-09-01 12:50",
  flightArrivalTime: "",
  flightDepartureAirport: "ONT",
  flightArrivalAirport: "SEA",
  flightNumber: "AS654",
  confirmationCode: "DPNNWG",
} as const;

const airbornePhaseOntSea: Extract<JourneyPhase, { kind: "airborne" }> = {
  kind: "airborne",
  onFlight: { ...LIVE_AS654_ON_FLIGHT },
  landingAt: "SEA",
  landingIn: "1h 49m",
};

test("F16: live AS654 reservation has MISSING booked arrival on flightArrivalTime", () => {
  const resolved = resolveBookedArrivalLocalTime(LIVE_AS654_ON_FLIGHT);
  assert.equal(resolved.field, null);
  assert.equal(resolved.value, null);
  assert.equal(LIVE_AS654_ON_FLIGHT.flightArrivalTime, "");
});

test("F16: lookup failure keeps In the air ONT→SEA, no landing countdown, no API error on Home", () => {
  const copy = resolveAirborneHeroCopy(airbornePhaseOntSea, {
    flightStatus: "",
    error: "No flight data found for that number and date.",
    checkedAt: "2026-09-01T20:13:00Z",
    busy: false,
  });
  assert.equal(copy.isLiveClaim, false);
  assert.equal(copy.eyebrow, "In the air");
  assert.equal(copy.title, "ONT → SEA");
  assert.doesNotMatch(copy.detail ?? "", /Landing in/i);
  assert.doesNotMatch(copy.detail ?? "", /No flight data found/i);
  assert.equal(copy.detail, null);
});

test("F16: unchecked status keeps route, no invented scheduled arrival for AS654", () => {
  const copy = resolveAirborneHeroCopy(airbornePhaseOntSea, undefined);
  assert.equal(copy.isLiveClaim, false);
  assert.equal(copy.eyebrow, "In the air");
  assert.equal(copy.title, "ONT → SEA");
  assert.doesNotMatch(copy.detail ?? "", /Landing in/i);
  assert.equal(copy.detail, null);
});

test("F16: lookup fail with no booked arrival leaves detail null", () => {
  const phaseNoArrival: Extract<JourneyPhase, { kind: "airborne" }> = {
    ...airbornePhaseOntSea,
    onFlight: { ...airbornePhaseOntSea.onFlight, flightArrivalTime: undefined },
  };
  const copy = resolveAirborneHeroCopy(phaseNoArrival, {
    flightStatus: "",
    error: "No flight data found for that number and date.",
    checkedAt: "2026-09-01T20:13:00Z",
    busy: false,
  });
  assert.equal(copy.detail, null);
  assert.doesNotMatch(copy.detail ?? "", /No flight data found/i);
});

test("F16: stored flightArrivalTime shows scheduled arrival detail only when proven", () => {
  const phaseWithArrival: Extract<JourneyPhase, { kind: "airborne" }> = {
    ...airbornePhaseOntSea,
    onFlight: {
      ...airbornePhaseOntSea.onFlight,
      flightArrivalTime: "2026-09-02 11:15",
    },
  };
  const copy = resolveAirborneHeroCopy(phaseWithArrival, undefined);
  assert.equal(copy.detail, "Scheduled arrival 11:15");
});

test("F16: parser alias arrivalTime is read when flightArrivalTime empty", () => {
  const phaseAlias: Extract<JourneyPhase, { kind: "airborne" }> = {
    ...airbornePhaseOntSea,
    onFlight: {
      ...airbornePhaseOntSea.onFlight,
      flightArrivalTime: "",
      arrivalTime: "2026-09-01 14:05",
    },
  };
  const copy = resolveAirborneHeroCopy(phaseAlias, undefined);
  assert.equal(copy.detail, "Scheduled arrival 14:05");
});

test("F16: active live status may show In the air landing countdown", () => {
  const copy = resolveAirborneHeroCopy(airbornePhaseOntSea, {
    flightStatus: "active",
    checkedAt: "2026-09-01T20:13:00Z",
    busy: false,
    error: null,
  });
  assert.equal(copy.isLiveClaim, true);
  assert.equal(copy.eyebrow, "In the air");
  assert.match(copy.detail ?? "", /Landing in 1h 49m/);
});

test("hasVerifiedLiveAirborneStatus rejects scheduled-only success", () => {
  assert.equal(
    hasVerifiedLiveAirborneStatus({
      flightStatus: "scheduled",
      checkedAt: new Date().toISOString(),
      busy: false,
      error: null,
    }),
    false,
  );
});

test("hasVerifiedLiveAirborneStatus accepts en-route statuses", () => {
  for (const status of ["active", "enroute", "departed", "approach"]) {
    assert.equal(
      hasVerifiedLiveAirborneStatus({
        flightStatus: status,
        checkedAt: new Date().toISOString(),
        busy: false,
        error: null,
      }),
      true,
      status,
    );
  }
});
