import assert from "node:assert/strict";
import test from "node:test";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  canRescanReservation,
  countRescannableReservations,
  mergeRescanIntoExisting,
} from "@/lib/travelAssistant/rescanTripImportsShared";
import { reservationNeedsPricingBackfill } from "@/lib/travelAssistant/rescanPricingBackfill";

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

test("canRescanReservation requires stored email source text or Resend id with missing pricing", () => {
  assert.equal(canRescanReservation(sampleReservation({ originalEmailText: "x".repeat(120) })), true);
  assert.equal(canRescanReservation(sampleReservation({ originalEmailText: "short" })), false);
  assert.equal(canRescanReservation(sampleReservation()), false);
  assert.equal(
    canRescanReservation(
      sampleReservation({
        originalEmailText: "short",
        sourceEmailId: "email-ita-1",
      }),
    ),
    true,
  );
});

test("countRescannableReservations counts Resend-backfillable flights missing pricing", () => {
  const count = countRescannableReservations([
    sampleReservation({ id: "a", originalEmailText: "x".repeat(120) }),
    // "b" has no stored email text or id, but does have a real confirmation
    // code and no pricing — G41 counts it too: the fare hunt must not be
    // gated behind stored email text when a confirmation code can search.
    sampleReservation({ id: "b" }),
    sampleReservation({
      id: "c",
      originalEmailText: "ITA receipt Z84T4Z",
      sourceEmailId: "email-ita-1",
    }),
  ]);
  assert.equal(count, 3);
});

test("reservationNeedsPricingBackfill when flight has points but no PDF cash", () => {
  const reservation = sampleReservation({
    quotedPointsMiles: 15000,
    originalEmailText: "ITA Airways Electronic travel receipt Reservation code Z84T4Z",
    sourceEmailId: "email-ita-1",
  });
  assert.equal(reservationNeedsPricingBackfill(reservation), true);
});

test("reservationNeedsPricingBackfill when flight lacks PDF attachment section", () => {
  const reservation = sampleReservation({
    originalEmailText: "ITA Airways Electronic travel receipt Reservation code Z84T4Z",
    sourceEmailId: "email-ita-1",
  });
  assert.equal(reservationNeedsPricingBackfill(reservation), true);
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
