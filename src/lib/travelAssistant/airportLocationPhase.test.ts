import assert from "node:assert/strict";
import test from "node:test";
import { resolveAirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";

test("G64: in-flight window returns departed not off after 60m past departure", () => {
  const depMs = Date.parse("2026-09-12T13:20:00.000Z");
  const arrMs = Date.parse("2026-09-12T16:25:00.000Z");
  const nowMs = depMs + 90 * 60_000;
  assert.equal(
    resolveAirportLocationPhase({
      departureUtcMs: depMs,
      arrivalUtcMs: arrMs,
      nowMs,
      locationStatus: "away",
    }),
    "departed",
  );
});
