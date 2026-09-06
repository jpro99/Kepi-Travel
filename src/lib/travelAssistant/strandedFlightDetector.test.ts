import assert from "node:assert/strict";
import test from "node:test";
import {
  detectStrandedAtAirport,
  ec261EligibleReason,
  STRANDED_DEPARTURE_GRACE_MIN,
} from "@/lib/travelAssistant/strandedFlightDetector";

const FCO_BRI = {
  id: "f1",
  type: "flight",
  flightNumber: "AZ1601",
  flightDepartureAirport: "FCO",
  flightArrivalAirport: "BRI",
  flightDepartureTime: "2026-09-06 10:00",
  timezone: "Europe/Rome",
};

test("stranded: departure passed + at-airport prompts missed flight", () => {
  const depMs = Date.parse("2026-09-06T08:00:00.000Z"); // ~10:00 Rome
  const nowMs = depMs + (STRANDED_DEPARTURE_GRACE_MIN + 30) * 60_000;
  const result = detectStrandedAtAirport({
    flight: FCO_BRI,
    locationStatus: "at-airport",
    nowMs,
  });
  assert.equal(result.shouldPrompt, true);
  assert.match(result.prompt?.headline ?? "", /miss this flight/i);
  assert.match(result.prompt?.subline ?? "", /FCO/);
});

test("stranded: away from airport — no prompt", () => {
  const nowMs = Date.parse("2026-09-06T12:00:00.000Z");
  const result = detectStrandedAtAirport({
    flight: FCO_BRI,
    locationStatus: "away",
    nowMs,
  });
  assert.equal(result.shouldPrompt, false);
});

test("stranded: live en-route — no prompt", () => {
  const depMs = Date.parse("2026-09-06T08:00:00.000Z");
  const nowMs = depMs + 60 * 60_000;
  const result = detectStrandedAtAirport({
    flight: FCO_BRI,
    locationStatus: "in-terminal",
    nowMs,
    liveEnRoute: true,
  });
  assert.equal(result.shouldPrompt, false);
});

test("stranded: dismissed state suppresses prompt", () => {
  const depMs = Date.parse("2026-09-06T08:00:00.000Z");
  const nowMs = depMs + 90 * 60_000;
  const result = detectStrandedAtAirport({
    flight: FCO_BRI,
    locationStatus: "at-airport",
    nowMs,
    existingState: {
      reservationId: "f1",
      detectedAt: new Date(depMs).toISOString(),
      dismissedAt: new Date(nowMs).toISOString(),
    },
  });
  assert.equal(result.shouldPrompt, false);
});

test("ec261EligibleReason: overbook and denied-boarding qualify", () => {
  assert.equal(ec261EligibleReason("overbook"), true);
  assert.equal(ec261EligibleReason("denied-boarding"), true);
  assert.equal(ec261EligibleReason("other"), false);
});
