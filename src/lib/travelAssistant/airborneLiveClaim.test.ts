import assert from "node:assert/strict";
import test from "node:test";
import {
  hasVerifiedLiveAirborneStatus,
  resolveAirborneHeroCopy,
} from "@/lib/travelAssistant/airborneLiveClaim";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

const airbornePhase: Extract<JourneyPhase, { kind: "airborne" }> = {
  kind: "airborne",
  onFlight: {
    id: "ont-sea",
    type: "flight",
    localTime: "2026-09-01 12:00",
    timezone: "America/Los_Angeles",
    flightDate: "2026-09-01",
    flightDepartureTime: "2026-09-01 12:00",
    flightArrivalTime: "2026-09-01 14:30",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightNumber: "AS654",
  },
  landingAt: "SEA",
  landingIn: "1h 49m",
};

test("F16: lookup failure keeps In the air ONT→SEA but pulls live landing countdown", () => {
  const copy = resolveAirborneHeroCopy(airbornePhase, {
    flightStatus: "",
    error: "No flight data found for that number and date.",
    checkedAt: "2026-09-01T20:13:00Z",
    busy: false,
  });
  assert.equal(copy.isLiveClaim, false);
  assert.equal(copy.eyebrow, "In the air");
  assert.equal(copy.title, "ONT → SEA");
  assert.doesNotMatch(copy.detail ?? "", /Landing in/i);
  assert.match(copy.detail ?? "", /No flight data found/i);
});

test("F16: unchecked status keeps route, no live landing countdown", () => {
  const copy = resolveAirborneHeroCopy(airbornePhase, undefined);
  assert.equal(copy.isLiveClaim, false);
  assert.equal(copy.eyebrow, "In the air");
  assert.equal(copy.title, "ONT → SEA");
  assert.doesNotMatch(copy.detail ?? "", /Landing in/i);
});

test("F16: active live status may show In the air landing countdown", () => {
  const copy = resolveAirborneHeroCopy(airbornePhase, {
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
