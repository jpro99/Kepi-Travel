import assert from "node:assert/strict";
import test from "node:test";
import { resolveAirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";

test("resolveAirportLocationPhase hides away travelers until inside 3h window", () => {
  const dep = Date.now() + 5 * 60 * 60_000;
  assert.equal(
    resolveAirportLocationPhase({
      departureUtcMs: dep,
      nowMs: Date.now(),
      locationStatus: "away",
    }),
    "off",
  );
});

test("resolveAirportLocationPhase shows check-in at SEA 4h before international depart", () => {
  const nowMs = Date.parse("2026-09-01T20:00:00.000Z");
  const dep = Date.parse("2026-09-02T01:30:00.000Z"); // 5.5h later — was incorrectly "off"
  assert.equal(
    resolveAirportLocationPhase({
      departureUtcMs: dep,
      nowMs,
      locationStatus: "at-airport",
    }),
    "check-in",
  );
});

test("resolveAirportLocationPhase in-terminal stays on for early international arrival", () => {
  const nowMs = Date.parse("2026-09-01T20:00:00.000Z");
  const dep = Date.parse("2026-09-02T01:30:00.000Z");
  assert.equal(
    resolveAirportLocationPhase({
      departureUtcMs: dep,
      nowMs,
      locationStatus: "in-terminal",
      hasLoungeAccess: true,
    }),
    "lounge",
  );
});
