import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import type { SuggestionOutcomeEvent } from "@/lib/travelAssistant/mlReadiness/types";
import { generateId } from "@/lib/utils/generateId";

const SUGGESTION_OUTCOMES_KEY = "ml-readiness:suggestion-outcomes";
const MAX_OUTCOMES = 1000;
const STORE_SCOPE = "travelAssistant/mlReadiness/suggestionOutcomeStore";

export async function logSuggestionOutcome(
  input: Omit<SuggestionOutcomeEvent, "id" | "recordedAt">,
  options?: { userId?: string },
): Promise<boolean> {
  try {
    const existing =
      (await kvStoreGet<SuggestionOutcomeEvent[]>(SUGGESTION_OUTCOMES_KEY, options)) ?? [];
    const event: SuggestionOutcomeEvent = {
      ...input,
      id: generateId(),
      recordedAt: new Date().toISOString(),
    };
    const next = [event, ...existing].slice(0, MAX_OUTCOMES);
    await kvStoreSet(SUGGESTION_OUTCOMES_KEY, next, options);
    return true;
  } catch (error) {
    logger.warn("Failed to log suggestion outcome.", {
      scope: STORE_SCOPE,
      surface: input.surface,
      suggestionKey: input.suggestionKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function listSuggestionOutcomes(options?: {
  userId?: string;
  limit?: number;
}): Promise<SuggestionOutcomeEvent[]> {
  try {
    const stored = await kvStoreGet<SuggestionOutcomeEvent[]>(SUGGESTION_OUTCOMES_KEY, options);
    if (!Array.isArray(stored)) return [];
    const limit = Math.max(1, Math.min(options?.limit ?? 100, MAX_OUTCOMES));
    return stored.slice(0, limit);
  } catch (error) {
    logger.warn("Failed to read suggestion outcomes.", {
      scope: STORE_SCOPE,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
