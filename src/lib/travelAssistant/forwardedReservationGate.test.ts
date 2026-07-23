import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForwardedReservationGate } from "./forwardedReservationGate";

const NOW = new Date("2026-07-06T12:00:00Z");

test("evaluateForwardedReservationGate passes a confident, complete flight", () => {
  const result = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    confidenceScore: 82,
    parsingStatus: "auto-parsed",
    now: NOW,
  });
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.reasons, []);
});

test("evaluateForwardedReservationGate holds low-confidence drafts for review", () => {
  const result = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    confidenceScore: 22,
    parsingStatus: "auto-parsed",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("Low parsing confidence")));
});

test("evaluateForwardedReservationGate holds flights missing airports or time", () => {
  const result = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "",
    flightDepartureAirport: "",
    flightArrivalAirport: "SEA",
    confidenceScore: 90,
    parsingStatus: "auto-parsed",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("Missing departure airport")));
});

test("evaluateForwardedReservationGate holds needs-user-input drafts regardless of score", () => {
  const result = evaluateForwardedReservationGate({
    type: "hotel",
    localTime: "2026-09-14 15:00",
    location: "Monopoli",
    confidenceScore: 95,
    parsingStatus: "needs-user-input",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("need your input")));
});

test("evaluateForwardedReservationGate holds implausible drafts even at high confidence", () => {
  const result = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "SEA",
    confidenceScore: 95,
    parsingStatus: "auto-parsed",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("both")));
});

test("evaluateForwardedReservationGate holds needs-review status (40-69) for review", () => {
  const result = evaluateForwardedReservationGate({
    type: "hotel",
    localTime: "2026-09-14 15:00",
    location: "Monopoli",
    confidenceScore: 55,
    parsingStatus: "needs-review",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("quick review")));
});

test("evaluateForwardedReservationGate honors missingFields", () => {
  const result = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    confidenceScore: 90,
    parsingStatus: "auto-parsed",
    missingFields: ["departureAirport", "localTime"],
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("Missing fields")));
});

test("evaluateForwardedReservationGate holds hotel missing raw location and time", () => {
  const result = evaluateForwardedReservationGate({
    type: "hotel",
    localTime: "",
    location: "",
    confidenceScore: 85,
    parsingStatus: "auto-parsed",
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.ok(result.reasons.some((reason) => reason.includes("Missing check-in")));
});
