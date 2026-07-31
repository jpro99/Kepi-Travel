import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForwardedReservationGate } from "./forwardedReservationGate";
import { assessForwardedDraft } from "./emailForwardParser";
import {
  canMutateLiveFromForward,
  isKnownReservationType,
  PROPOSED_UPDATE_REVIEW_IMPACT,
  UNKNOWN_TYPE_REVIEW_REASON,
} from "./forwardedIngestDecision";

test("F6: canMutateLiveFromForward is false when gate holds", () => {
  assert.equal(canMutateLiveFromForward(true), false);
  assert.equal(canMutateLiveFromForward(false), true);
});

test("F6: medium-confidence re-forward matching a live flight must not mutate", () => {
  const assessment = assessForwardedDraft(
    {
      type: "flight",
      title: "SEA to ONT",
      provider: "Alaska",
      localTime: "2026-09-14 08:45",
      departureAirport: "SEA",
      arrivalAirport: "ONT",
      flightNumber: "AS101",
      confirmationCode: "ABC123",
      location: "SEA -> ONT",
    },
    55,
  );
  assert.equal(assessment.parsingStatus, "needs-review");
  const gate = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "ONT",
    confidenceScore: assessment.confidenceScore,
    parsingStatus: assessment.parsingStatus,
    missingFields: assessment.missingFields,
  });
  assert.equal(gate.needsReview, true);
  assert.equal(canMutateLiveFromForward(gate.needsReview), false);
  assert.match(PROPOSED_UPDATE_REVIEW_IMPACT, /Proposed update/u);
});

test("F7: weak second draft is held while strong first would pass", () => {
  const strong = assessForwardedDraft(
    {
      type: "flight",
      title: "ONT to SEA",
      provider: "Alaska",
      localTime: "2026-09-14 08:45",
      departureAirport: "ONT",
      arrivalAirport: "SEA",
      flightNumber: "AS200",
      confirmationCode: "PNR1",
      location: "ONT -> SEA",
    },
    88,
  );
  const weak = assessForwardedDraft(
    {
      type: "hotel",
      title: "",
      provider: "",
      localTime: "",
      location: "",
      confirmationCode: "",
    },
    88,
  );
  const strongGate = evaluateForwardedReservationGate({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    confidenceScore: strong.confidenceScore,
    parsingStatus: strong.parsingStatus,
    missingFields: strong.missingFields,
  });
  const weakGate = evaluateForwardedReservationGate({
    type: "hotel",
    localTime: "",
    location: "",
    confidenceScore: weak.confidenceScore,
    parsingStatus: weak.parsingStatus,
    missingFields: weak.missingFields,
  });
  assert.equal(strongGate.needsReview, false);
  assert.equal(weakGate.needsReview, true);
  assert.ok(weak.missingFields.length > 0);
  assert.ok(weakGate.reasons.some((reason) => reason.includes("Missing fields")));
});

test("F11: unknown type is not a known reservation type and forces hold reason", () => {
  assert.equal(isKnownReservationType("excursion"), false);
  assert.equal(isKnownReservationType("flight"), true);
  assert.match(UNKNOWN_TYPE_REVIEW_REASON, /Unknown reservation type/u);
});
