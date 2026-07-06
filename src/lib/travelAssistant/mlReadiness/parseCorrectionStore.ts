import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import type { ParseCorrectionRecord } from "@/lib/travelAssistant/mlReadiness/types";

const PARSE_CORRECTIONS_KEY = "ml-readiness:parse-corrections";
const MAX_CORRECTIONS = 500;
const STORE_SCOPE = "travelAssistant/mlReadiness/parseCorrectionStore";

export async function listParseCorrections(options?: {
  userId?: string;
  limit?: number;
}): Promise<ParseCorrectionRecord[]> {
  try {
    const stored = await kvStoreGet<ParseCorrectionRecord[]>(PARSE_CORRECTIONS_KEY, options);
    if (!Array.isArray(stored)) return [];
    const limit = Math.max(1, Math.min(options?.limit ?? MAX_CORRECTIONS, MAX_CORRECTIONS));
    return stored.slice(0, limit);
  } catch (error) {
    logger.warn("Failed to read parse corrections.", {
      scope: STORE_SCOPE,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function appendParseCorrection(
  record: ParseCorrectionRecord,
  options?: { userId?: string },
): Promise<boolean> {
  try {
    const existing = await listParseCorrections({ ...options, limit: MAX_CORRECTIONS });
    const next = [record, ...existing.filter((entry) => entry.id !== record.id)].slice(0, MAX_CORRECTIONS);
    await kvStoreSet(PARSE_CORRECTIONS_KEY, next, options);
    return true;
  } catch (error) {
    logger.warn("Failed to persist parse correction.", {
      scope: STORE_SCOPE,
      reviewItemId: record.reviewItemId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
