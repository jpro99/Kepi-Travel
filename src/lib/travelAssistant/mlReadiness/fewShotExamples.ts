import { listParseCorrections } from "@/lib/travelAssistant/mlReadiness/parseCorrectionStore";
import type { FewShotParseExample, ParseCorrectionRecord } from "@/lib/travelAssistant/mlReadiness/types";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function toFewShotExample(record: ParseCorrectionRecord): FewShotParseExample {
  return {
    sourceTextSnippet: record.sourceTextSnippet,
    parserGuess: record.parserGuess,
    corrected: record.corrected,
  };
}

export async function getFewShotExamplesForEmail(
  sourceText: string,
  options?: { userId?: string; limit?: number },
): Promise<FewShotParseExample[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 3, 5));
  const corrections = await listParseCorrections({ userId: options?.userId, limit: 100 });
  if (corrections.length === 0 || !sourceText.trim()) return [];

  return corrections
    .map((record) => ({
      record,
      score: overlapScore(sourceText, record.sourceTextSnippet),
    }))
    .filter((entry) => entry.score >= 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => toFewShotExample(entry.record));
}

export function formatFewShotBlock(examples: FewShotParseExample[]): string {
  if (examples.length === 0) return "";
  const blocks = examples.map((example, index) => {
    return [
      `Example ${index + 1}:`,
      `Email snippet:\n${example.sourceTextSnippet.slice(0, 1200)}`,
      `Incorrect parse:\n${JSON.stringify(example.parserGuess)}`,
      `User-corrected:\n${JSON.stringify(example.corrected)}`,
    ].join("\n");
  });
  return ["Prior user corrections (prefer the corrected shape when similar):", ...blocks].join("\n\n");
}
