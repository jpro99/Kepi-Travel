import assert from "node:assert/strict";
import test from "node:test";
import {
  getReviewTriageScore,
  sortReviewQueueForActiveLearning,
} from "@/lib/travelAssistant/mlReadiness/reviewQueueTriage";

test("sortReviewQueueForActiveLearning prioritizes low confidence and implausible items", () => {
  const queue = [
    {
      id: "high-confidence",
      parseConfidenceScore: 88,
      reasons: [],
      missingFields: [],
      parsingStatus: "needs-review" as const,
    },
    {
      id: "low-confidence",
      parseConfidenceScore: 18,
      reasons: ["Low parsing confidence (18/100)."],
      missingFields: ["localTime"],
      parsingStatus: "needs-user-input" as const,
    },
    {
      id: "medium-confidence",
      parseConfidenceScore: 52,
      reasons: ["Missing departure airport, arrival airport, or departure time."],
      missingFields: ["location"],
      parsingStatus: "needs-review" as const,
    },
  ];

  const sorted = sortReviewQueueForActiveLearning(queue);
  assert.equal(sorted[0]?.id, "low-confidence");
  assert.ok(getReviewTriageScore(sorted[0]!) < getReviewTriageScore(sorted[1]!));
});
