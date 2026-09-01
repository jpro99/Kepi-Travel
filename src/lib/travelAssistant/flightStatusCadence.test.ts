import assert from "node:assert/strict";
import test from "node:test";
import {
  FLIGHT_STATUS_POLL_INTERVAL_NEAR_MS,
  FLIGHT_STATUS_POLL_INTERVAL_FAR_MS,
  FLIGHT_STATUS_POLL_INTERVAL_AT_AIRPORT_MS,
  FLIGHT_STATUS_POLL_INTERVAL_IN_TERMINAL_MS,
  isFlightStatusStale,
  resolveFlightStatusPollIntervalMs,
  shouldPollFlightStatus,
} from "@/lib/travelAssistant/flightStatusCadence";

test("resolveFlightStatusPollIntervalMs uses 90s within 6h of departure", () => {
  const nowMs = Date.parse("2026-09-01T10:00:00Z");
  const depMs = nowMs + 4 * 60 * 60_000;
  assert.equal(resolveFlightStatusPollIntervalMs(depMs, nowMs), FLIGHT_STATUS_POLL_INTERVAL_NEAR_MS);
});

test("resolveFlightStatusPollIntervalMs uses 5m between 6h and 24h", () => {
  const nowMs = Date.parse("2026-09-01T10:00:00Z");
  const depMs = nowMs + 12 * 60 * 60_000;
  assert.equal(resolveFlightStatusPollIntervalMs(depMs, nowMs), FLIGHT_STATUS_POLL_INTERVAL_FAR_MS);
});

test("resolveFlightStatusPollIntervalMs uses 2s at airport and 1s in terminal", () => {
  const nowMs = Date.parse("2026-09-01T10:00:00Z");
  const depMs = nowMs + 12 * 60 * 60_000;
  assert.equal(
    resolveFlightStatusPollIntervalMs(depMs, nowMs, "at-airport"),
    FLIGHT_STATUS_POLL_INTERVAL_AT_AIRPORT_MS,
  );
  assert.equal(
    resolveFlightStatusPollIntervalMs(depMs, nowMs, "in-terminal"),
    FLIGHT_STATUS_POLL_INTERVAL_IN_TERMINAL_MS,
  );
});

test("shouldPollFlightStatus excludes flights more than 24h out", () => {
  const nowMs = Date.parse("2026-09-01T10:00:00Z");
  const depMs = nowMs + 30 * 60 * 60_000;
  assert.equal(shouldPollFlightStatus(depMs, nowMs), false);
});

test("isFlightStatusStale respects phase-aware interval", () => {
  const nowMs = Date.parse("2026-09-01T10:00:00Z");
  const depMs = nowMs + 2 * 60 * 60_000;
  const fresh = new Date(nowMs - 60_000).toISOString();
  const stale = new Date(nowMs - 120_000).toISOString();
  assert.equal(isFlightStatusStale(fresh, depMs, nowMs), false);
  assert.equal(isFlightStatusStale(stale, depMs, nowMs), true);
});
