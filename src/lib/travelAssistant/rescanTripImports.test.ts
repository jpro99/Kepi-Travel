import assert from "node:assert/strict";
import test from "node:test";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  canRescanReservation,
  countRescannableReservations,
  mergeRescanIntoExisting,
} from "@/lib/travelAssistant/rescanTripImports";

function sampleReservation(overrides: Partial<SessionReservation> = {}): SessionReservation {
  return {
    id: "res-1",
    type: "flight",
    title: "SEA -> LAX",
    provider: "Alaska",
    localTime: "2026-08-01 09:00",
    timezone: "America/Los_Angeles",
    location: "SEA -> LAX",
    confirmationCode: "ABC123",
    assignedTo: [],
    stage: "readiness",
    critical: true,
    confidence: "medium",
    notes: "",
    source: "imported",
    flightNumber: "AS123",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "LAX",
    ...overrides,
  };
}

test("canRescanReservation requires stored email source text", () => {
  assert.equal(canRescanReservation(sampleReservation({ originalEmailText: "x".repeat(120) })), true);
  assert.equal(canRescanReservation(sampleReservation({ originalEmailText: "short" })), false);
  assert.equal(canRescanReservation(sampleReservation()), false);
});

test("countRescannableReservations counts only reservations with enough source text", () => {
  const count = countRescannableReservations([
    sampleReservation({ id: "a", originalEmailText: "x".repeat(120) }),
    sampleReservation({ id: "b" }),
  ]);
  assert.equal(count, 1);
});

test("mergeRescanIntoExisting fills only empty fields and keeps user edits", () => {
  const existing = sampleReservation({
    flightDepartureGate: "",
    quotedPriceUsd: undefined,
    provider: "Alaska",
  });
  const { reservation, filledFields } = mergeRescanIntoExisting(existing, {
    flightDepartureGate: "C12",
    quotedPriceUsd: 245,
    provider: "United",
    flightNumber: "UA999",
  });

  assert.equal(reservation.flightDepartureGate, "C12");
  assert.equal(reservation.quotedPriceUsd, 245);
  assert.equal(reservation.provider, "Alaska");
  assert.equal(reservation.flightNumber, "AS123");
  assert.ok(filledFields.includes("flightDepartureGate"));
  assert.ok(filledFields.includes("quotedPriceUsd"));
  assert.ok(!filledFields.includes("provider"));
  assert.ok(!filledFields.includes("flightNumber"));
});
