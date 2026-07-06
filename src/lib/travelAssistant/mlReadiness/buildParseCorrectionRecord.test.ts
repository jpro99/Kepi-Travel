import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParseCorrectionRecord,
  diffParseDraftFields,
} from "@/lib/travelAssistant/mlReadiness/buildParseCorrectionRecord";

test("buildParseCorrectionRecord marks edited-then-accepted when fields change", () => {
  const record = buildParseCorrectionRecord({
    reviewItemId: "review-1",
    parserGuess: {
      type: "flight",
      title: "Flight to Seattle",
      provider: "Alaska Airlines",
      localTime: "2026-09-14 08:45",
      timezone: "America/Los_Angeles",
      location: "ONT",
      confirmationCode: "ABC123",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
    },
    corrected: {
      type: "flight",
      title: "Flight to Seattle",
      provider: "Alaska Airlines",
      localTime: "2026-09-14 09:00",
      timezone: "America/Los_Angeles",
      location: "ONT",
      confirmationCode: "ABC123",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
    },
    gateReasons: ["Low parsing confidence (35/100)."],
    parseConfidenceScore: 35,
    originalEmailText: "Flight AS654 departs 8:45 AM",
  });

  assert.equal(record.outcome, "edited-then-accepted");
  assert.deepEqual(record.changedFields, ["localTime"]);
  assert.equal(record.parserVersion.length > 0, true);
});

test("diffParseDraftFields ignores unchanged numeric nulls", () => {
  const changed = diffParseDraftFields(
    { quotedPriceUsd: null },
    { quotedPriceUsd: null, title: "Hotel stay" },
  );
  assert.deepEqual(changed, ["title"]);
});
