type ReviewTriageItem = {
  id: string;
  reasons?: string[];
  parseConfidenceScore?: number;
  parsingStatus?: "auto-parsed" | "needs-review" | "needs-user-input";
  missingFields?: string[];
  draft?: {
    confidence?: "high" | "medium" | "low";
  };
};

function getConfidenceScore(item: ReviewTriageItem): number {
  if (typeof item.parseConfidenceScore === "number" && Number.isFinite(item.parseConfidenceScore)) {
    return item.parseConfidenceScore;
  }
  if (item.draft?.confidence === "high") return 85;
  if (item.draft?.confidence === "medium") return 55;
  return 25;
}

function getMissingFieldCount(item: ReviewTriageItem): number {
  if (Array.isArray(item.missingFields) && item.missingFields.length > 0) {
    return item.missingFields.length;
  }
  return 0;
}

function getPlausibilityPenalty(item: ReviewTriageItem): number {
  const reasons = item.reasons ?? [];
  let penalty = 0;
  for (const reason of reasons) {
    if (/implausible|invalid|mismatch|before check-in|after check-out|unknown airport|future year/iu.test(reason)) {
      penalty += 20;
    } else if (/missing departure|missing check-in|low parsing confidence/iu.test(reason)) {
      penalty += 10;
    }
  }
  if (item.parsingStatus === "needs-user-input") penalty += 15;
  return penalty;
}

/** Lower score = review first (active learning triage). */
export function getReviewTriageScore(item: ReviewTriageItem): number {
  const confidence = getConfidenceScore(item);
  const missingCount = getMissingFieldCount(item);
  const plausibilityPenalty = getPlausibilityPenalty(item);
  return confidence - missingCount * 8 - plausibilityPenalty;
}

export function sortReviewQueueForActiveLearning<T extends ReviewTriageItem>(queue: T[]): T[] {
  return [...queue].sort((left, right) => {
    const leftScore = getReviewTriageScore(left);
    const rightScore = getReviewTriageScore(right);
    if (leftScore !== rightScore) return leftScore - rightScore;
    return left.id.localeCompare(right.id);
  });
}
