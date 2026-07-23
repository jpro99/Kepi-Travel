import assert from "node:assert/strict";
import test from "node:test";
import { enrichReservationForAutoImport } from "@/lib/travelAssistant/autoImportReservation";
import { evaluateForwardedReservationGate } from "@/lib/travelAssistant/forwardedReservationGate";
import {
  isBookingShapedParserDraft,
  OUT_OF_WINDOW_REVIEW_REASON,
  selectDraftsToImport,
} from "@/lib/travelAssistant/forwardedDraftImport";

test("I30: raw gate holds incomplete hotel before enrich would invent defaults", () => {
  const gate = evaluateForwardedReservationGate({
    type: "hotel",
    localTime: "",
    location: "",
    confidenceScore: 75,
    parsingStatus: "auto-parsed",
  });
  assert.equal(gate.needsReview, true);

  const enriched = enrichReservationForAutoImport({
    type: "hotel",
    title: "",
    provider: "",
    localTime: "",
    location: "",
    timezone: "Etc/UTC",
  });
  assert.equal(enriched.location, "Hotel stay");
  assert.match(enriched.localTime, /^\d{4}-\d{2}-\d{2} 12:00$/u);
});

test("day-plan forward still imports booking-shaped drafts from the same email", () => {
  const dayPlanNoise = {
    type: "ride",
    title: "Day 3 — explore old town",
    provider: "",
    localTime: "",
    location: "",
  };
  const hotelConfirmation = {
    type: "hotel",
    title: "Hotel Roma",
    provider: "Hyatt",
    localTime: "2026-09-09 15:00",
    location: "Monopoli, Italy",
    confirmationCode: "HY123",
  };

  assert.equal(isBookingShapedParserDraft(dayPlanNoise), false);
  assert.equal(isBookingShapedParserDraft(hotelConfirmation), true);

  const selected = selectDraftsToImport([dayPlanNoise, hotelConfirmation], true);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.confirmationCode, "HY123");
});

test("non-day-plan forwards keep all parser drafts", () => {
  const drafts = [{ type: "ride", title: "Maybe a ride" }];
  assert.deepEqual(selectDraftsToImport(drafts, false), drafts);
});

test("out-of-window review reason is explicit for travelers", () => {
  assert.match(OUT_OF_WINDOW_REVIEW_REASON, /Outside active trip dates/iu);
});
