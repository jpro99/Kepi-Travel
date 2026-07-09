import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import type {
  ConfidenceCalibrationStats,
  ParseCorrectionRecord,
} from "@/lib/travelAssistant/mlReadiness/types";

const CALIBRATION_KEY = "ml-readiness:confidence-calibration";
const STORE_SCOPE = "travelAssistant/mlReadiness/confidenceCalibration";

const BUCKET_EDGES = [0, 20, 40, 60, 80, 100] as const;

function emptyStats(): ConfidenceCalibrationStats {
  const buckets = [];
  for (let index = 0; index < BUCKET_EDGES.length - 1; index += 1) {
    buckets.push({
      bucketMin: BUCKET_EDGES[index],
      bucketMax: BUCKET_EDGES[index + 1],
      acceptedWithoutEdit: 0,
      acceptedWithEdit: 0,
      total: 0,
    });
  }
  return { updatedAt: new Date().toISOString(), buckets };
}

function bucketIndexForScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  for (let index = 0; index < BUCKET_EDGES.length - 1; index += 1) {
    if (clamped >= BUCKET_EDGES[index] && clamped < BUCKET_EDGES[index + 1]) {
      return index;
    }
  }
  return BUCKET_EDGES.length - 2;
}

export async function getConfidenceCalibrationStats(options?: {
  userId?: string;
}): Promise<ConfidenceCalibrationStats> {
  try {
    const stored = await kvStoreGet<ConfidenceCalibrationStats>(CALIBRATION_KEY, options);
    if (!stored || !Array.isArray(stored.buckets)) {
      return emptyStats();
    }
    return stored;
  } catch (error) {
    logger.warn("Failed to read confidence calibration stats.", {
      scope: STORE_SCOPE,
      error: error instanceof Error ? error.message : String(error),
    });
    return emptyStats();
  }
}

export async function recordCalibrationFromCorrection(
  correction: ParseCorrectionRecord,
  options?: { userId?: string },
): Promise<void> {
  const score =
    typeof correction.parseConfidenceScore === "number" && Number.isFinite(correction.parseConfidenceScore)
      ? correction.parseConfidenceScore
      : 0;
  try {
    const stats = await getConfidenceCalibrationStats(options);
    const bucketIndex = bucketIndexForScore(score);
    const bucket = stats.buckets[bucketIndex];
    if (!bucket) return;
    bucket.total += 1;
    if (correction.outcome === "accepted") {
      bucket.acceptedWithoutEdit += 1;
    } else {
      bucket.acceptedWithEdit += 1;
    }
    stats.updatedAt = new Date().toISOString();
    await kvStoreSet(CALIBRATION_KEY, stats, options);
  } catch (error) {
    logger.warn("Failed to update confidence calibration stats.", {
      scope: STORE_SCOPE,
      reviewItemId: correction.reviewItemId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Lightweight adjustment hook for future rankers — currently identity. */
export function applyConfidenceCalibration(score: number): number {
  return Math.max(0, Math.min(100, score));
}
