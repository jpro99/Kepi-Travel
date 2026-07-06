import type { BuildParseCorrectionInput } from "@/lib/travelAssistant/mlReadiness/buildParseCorrectionRecord";

export async function postParseCorrection(input: BuildParseCorrectionInput): Promise<void> {
  try {
    await fetch("/api/ml-readiness/parse-corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // Non-blocking telemetry — UI must not fail if logging fails.
  }
}

export async function postSuggestionOutcome(input: {
  surface: string;
  suggestionKey: string;
  outcome: "impression" | "dismiss" | "accept" | "click";
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await fetch("/api/ml-readiness/suggestion-outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // Non-blocking telemetry.
  }
}
