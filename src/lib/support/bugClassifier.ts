import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

export type BugConfidence = "high" | "medium" | "low" | "not-a-bug";

export interface BugClassification {
  confidence: BugConfidence;
  isCodeBug: boolean;
  summary: string;
  suggestedLabel: string;
  suggestedFile?: string;
}

const CLASSIFIER_SYSTEM = `You are a triage engineer for Kepi Travel, a Next.js 14 / React travel assistant app.
When given a user bug report, respond with JSON only (no prose):
{
  "confidence": "high" | "medium" | "low" | "not-a-bug",
  "isCodeBug": true | false,
  "summary": "one-line bug summary for a GitHub issue title",
  "suggestedLabel": "bug" | "ui" | "data" | "billing" | "provider" | "question",
  "suggestedFile": "optional: most likely source file path like src/components/..."
}

Rules:
- "high" confidence: reproducible, specific route/component, mentions crash/pins/error message
- "medium": plausible bug, partial info
- "low": vague, could be user error
- "not-a-bug": billing, provider outage, how-to question, feature request
- isCodeBug = true only for confidence high/medium AND category bug/ui/data
`;

export async function classifyBugReport(args: {
  category: string;
  whatHappened: string;
  whatExpected: string;
  url: string;
  userAgent: string;
  hasScreenshot: boolean;
}): Promise<BugClassification> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const fallback: BugClassification = {
    confidence: "medium",
    isCodeBug: true,
    summary: `${args.category}: ${args.whatHappened.slice(0, 80)}`,
    suggestedLabel: "bug",
  };

  if (!apiKey) {
    logger.warn("ANTHROPIC_API_KEY missing — using fallback bug classification.");
    return fallback;
  }

  const prompt = [
    `Category: ${args.category}`,
    `What happened: ${args.whatHappened}`,
    `What expected: ${args.whatExpected || "(not provided)"}`,
    `URL: ${args.url || "(unknown)"}`,
    `Has screenshot: ${args.hasScreenshot}`,
    `User agent: ${args.userAgent?.slice(0, 120) || "(unknown)"}`,
  ].join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      temperature: 0,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = msg.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/u);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<BugClassification>;
    return {
      confidence: parsed.confidence ?? fallback.confidence,
      isCodeBug: Boolean(parsed.isCodeBug),
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      suggestedLabel: typeof parsed.suggestedLabel === "string" ? parsed.suggestedLabel : "bug",
      suggestedFile: typeof parsed.suggestedFile === "string" ? parsed.suggestedFile : undefined,
    };
  } catch (error) {
    logger.warn("Bug classifier failed.", { error: error instanceof Error ? error.message : "unknown" });
    return fallback;
  }
}
