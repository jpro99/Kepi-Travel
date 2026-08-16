"use client";

import { useEffect, useState } from "react";
import { postSuggestionOutcome } from "@/lib/travelAssistant/mlReadiness/clientTelemetry";

interface InputStyleSuggestion {
  channel: string;
  message: string;
}

interface InputStyleSuggestionCardProps {
  onAccept?: (channel: string) => void;
}

export function InputStyleSuggestionCard({ onAccept }: InputStyleSuggestionCardProps) {
  const [suggestion, setSuggestion] = useState<InputStyleSuggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void fetch("/api/traveler/input-style", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { suggestion?: InputStyleSuggestion | null }) => {
        setSuggestion(payload.suggestion ?? null);
      })
      .catch(() => setSuggestion(null));
  }, []);

  useEffect(() => {
    if (!suggestion || dismissed) return;
    void postSuggestionOutcome({
      surface: "input-style-suggestion",
      suggestionKey: suggestion.channel,
      outcome: "impression",
      honest: true,
    });
  }, [suggestion, dismissed]);

  if (!suggestion || dismissed) return null;

  return (
    <div className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-900 dark:text-cyan-100">
      <p>{suggestion.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void postSuggestionOutcome({
              surface: "input-style-suggestion",
              suggestionKey: suggestion.channel,
              outcome: "accept",
              honest: true,
            });
            onAccept?.(suggestion.channel);
            setDismissed(true);
          }}
          className="rounded-md bg-cyan-600 px-2 py-1 font-semibold text-white hover:bg-cyan-500"
        >
          Yes, show me how
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            void postSuggestionOutcome({
              surface: "input-style-suggestion",
              suggestionKey: suggestion.channel,
              outcome: "dismiss",
              honest: true,
            });
          }}
          className="rounded-md px-2 py-1 text-cyan-800 underline dark:text-cyan-200"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
