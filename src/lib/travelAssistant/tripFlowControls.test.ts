import assert from "node:assert/strict";
import test from "node:test";
import {
  nextTripStage,
  shouldQuickAddGoToReview,
  shouldShowFocusPanel,
} from "@/lib/travelAssistant/tripFlowControls";

test("focus mode only shows stage-relevant panels", () => {
  assert.equal(
    shouldShowFocusPanel({ panel: "recovery", stage: "airport", focusMode: true }),
    false,
  );
  assert.equal(
    shouldShowFocusPanel({ panel: "anti-miss", stage: "airport", focusMode: true }),
    true,
  );
  assert.equal(
    shouldShowFocusPanel({ panel: "collaboration", stage: "arrival", focusMode: true }),
    true,
  );
  assert.equal(
    shouldShowFocusPanel({ panel: "ops", stage: "readiness", focusMode: false }),
    true,
  );
});

test("quick add routes low-confidence or weak details to review", () => {
  assert.equal(
    shouldQuickAddGoToReview({
      confidence: "low",
      inputText: "Ride maybe tonight",
    }),
    true,
  );
  assert.equal(
    shouldQuickAddGoToReview({
      confidence: "medium",
      inputText: "Dinner reservation tomorrow",
    }),
    true,
  );
  assert.equal(
    shouldQuickAddGoToReview({
      confidence: "high",
      inputText: "Dinner at 7:30 pm at Union Square Bistro for Alex",
    }),
    false,
  );
});

test("nextTripStage advances readiness through recovery", () => {
  assert.equal(nextTripStage("readiness"), "pre-departure");
  assert.equal(nextTripStage("pre-departure"), "airport");
  assert.equal(nextTripStage("airport"), "arrival");
  assert.equal(nextTripStage("arrival"), "recovery");
  assert.equal(nextTripStage("recovery"), "recovery");
});
