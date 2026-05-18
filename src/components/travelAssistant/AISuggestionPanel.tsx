"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type DisruptionScenario = "none" | "missed-flight" | "train-delay" | "ride-no-show";
type SuggestionType = "layover" | "disruption" | "packing" | "briefing";

type ReservationContext = {
  id?: string;
  type: string;
  title: string;
  provider?: string;
  localTime?: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
};

type UpdateFeedContext = {
  provider: string;
  summary: string;
  severity: "info" | "warning" | "critical";
};

interface AISuggestionPanelProps {
  tripStage: TripStage;
  reservations: ReservationContext[];
  activeScenario: DisruptionScenario;
  updateFeed: UpdateFeedContext[];
}

interface LayoverContext {
  airport: string;
  layoverMinutes: number;
}

interface SuggestionOption {
  type: SuggestionType;
  label: string;
  subtitle: string;
  context: Record<string, unknown>;
}

function parseDateValue(input: string | undefined): number {
  if (!input) return Number.NaN;
  const parsed = Date.parse(input.replace(" ", "T"));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function extractAirportCode(...candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/\b([A-Z]{3})\b/u);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function detectLayoverContext(reservations: readonly ReservationContext[]): LayoverContext | null {
  const flights = reservations
    .filter((reservation) => reservation.type === "flight")
    .map((reservation) => ({
      reservation,
      timeMs: parseDateValue(reservation.localTime),
    }))
    .filter((entry) => !Number.isNaN(entry.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);

  if (flights.length < 2) {
    return null;
  }

  for (let index = 1; index < flights.length; index += 1) {
    const previous = flights[index - 1];
    const current = flights[index];
    if (!previous || !current) {
      continue;
    }
    const gapMinutes = Math.round((current.timeMs - previous.timeMs) / 60000);
    if (gapMinutes <= 90) {
      continue;
    }
    const airport = extractAirportCode(current.reservation.location, current.reservation.title) ?? "airport";
    return { airport, layoverMinutes: gapMinutes };
  }

  return null;
}

function stageEmptyStateMessage(stage: TripStage): string {
  if (stage === "airport") {
    return "Layover guidance will appear when a connection over 90 minutes is detected.";
  }
  if (stage === "readiness") {
    return "Add reservations to receive packing and pre-trip briefing suggestions.";
  }
  if (stage === "recovery") {
    return "AI recovery guidance appears automatically when disruption context is available.";
  }
  return "AI suggestions are available only for readiness, airport, and recovery moments.";
}

export function AISuggestionPanel({ tripStage, reservations, activeScenario, updateFeed }: AISuggestionPanelProps) {
  const [selectedTypeOverride, setSelectedTypeOverride] = useState<SuggestionType | null>(null);
  const [suggestionText, setSuggestionText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const typingBufferRef = useRef("");
  const streamDoneRef = useRef(false);

  const stageSupportsSuggestions = tripStage === "readiness" || tripStage === "airport" || tripStage === "recovery";

  const layoverContext = useMemo(() => detectLayoverContext(reservations), [reservations]);

  const availableSuggestions = useMemo<SuggestionOption[]>(() => {
    if (!stageSupportsSuggestions) {
      return [];
    }

    const reservationPayload = reservations.slice(0, 20).map((reservation) => ({
      id: reservation.id,
      type: reservation.type,
      title: reservation.title,
      provider: reservation.provider,
      localTime: reservation.localTime,
      timezone: reservation.timezone,
      location: reservation.location,
      confirmationCode: reservation.confirmationCode,
      notes: reservation.notes,
    }));

    if (tripStage === "readiness") {
      return [
        {
          type: "packing",
          label: "Packing reminders",
          subtitle: "Stage-aware prep list before departure.",
          context: {
            reservations: reservationPayload,
          },
        },
        {
          type: "briefing",
          label: "Trip briefing",
          subtitle: "Operational summary, risks, and local checks.",
          context: {
            reservations: reservationPayload,
          },
        },
      ];
    }

    if (tripStage === "airport") {
      if (!layoverContext) {
        return [];
      }
      return [
        {
          type: "layover",
          label: "Layover strategy",
          subtitle: "How to use connection time without missing boarding.",
          context: {
            airport: layoverContext.airport,
            layoverMinutes: layoverContext.layoverMinutes,
          },
        },
      ];
    }

    if (tripStage === "recovery") {
      return [
        {
          type: "disruption",
          label: "Recovery plan",
          subtitle: "Rebooking, hotel fallback, and ground transport options.",
          context: {
            scenario: activeScenario === "none" ? "operational disruption" : activeScenario.replaceAll("-", " "),
            summary: updateFeed[0]?.summary ?? "Active disruption handling required.",
            severity: updateFeed[0]?.severity ?? "critical",
            impactedReservations: reservationPayload.slice(0, 10),
            latestUpdates: updateFeed.slice(0, 6).map((item) => ({
              provider: item.provider,
              summary: item.summary,
              severity: item.severity,
            })),
          },
        },
      ];
    }

    return [];
  }, [activeScenario, layoverContext, reservations, stageSupportsSuggestions, tripStage, updateFeed]);

  const selectedType = useMemo<SuggestionType | null>(() => {
    if (availableSuggestions.length === 0) {
      return null;
    }
    if (
      selectedTypeOverride &&
      availableSuggestions.some((suggestionOption) => suggestionOption.type === selectedTypeOverride)
    ) {
      return selectedTypeOverride;
    }
    return availableSuggestions[0]?.type ?? null;
  }, [availableSuggestions, selectedTypeOverride]);

  const requestSuggestion = useCallback(
    async (suggestionType: SuggestionType): Promise<void> => {
      const selectedSuggestion = availableSuggestions.find((item) => item.type === suggestionType);
      if (!selectedSuggestion) {
        return;
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      typingBufferRef.current = "";
      streamDoneRef.current = false;

      setSuggestionText("");
      setErrorMessage(null);
      setIsStreaming(true);

      try {
        const response = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: suggestionType,
            context: selectedSuggestion.context,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let message = `AI request failed (${response.status})`;
          try {
            const errorPayload = (await response.json()) as { error?: string };
            if (errorPayload.error) {
              message = errorPayload.error;
            }
          } catch {
            // Keep HTTP status-based message.
          }
          throw new Error(message);
        }

        if (!response.body) {
          throw new Error("No suggestion stream returned.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (activeRequestIdRef.current === requestId) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }
          typingBufferRef.current += decoder.decode(value, { stream: true });
        }
        typingBufferRef.current += decoder.decode();
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "AI suggestions unavailable right now.";
        setErrorMessage(message);
        typingBufferRef.current += "AI suggestions are currently unavailable. Try regenerate in a moment.";
      } finally {
        if (activeRequestIdRef.current === requestId) {
          streamDoneRef.current = true;
        }
      }
    },
    [availableSuggestions],
  );

  useEffect(() => {
    if (!selectedType) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void requestSuggestion(selectedType);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [requestSuggestion, selectedType]);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const timer = window.setInterval(() => {
      if (typingBufferRef.current.length > 0) {
        const nextChunk = typingBufferRef.current.slice(0, 4);
        typingBufferRef.current = typingBufferRef.current.slice(nextChunk.length);
        setSuggestionText((previous) => `${previous}${nextChunk}`);
        return;
      }
      if (streamDoneRef.current) {
        setIsStreaming(false);
      }
    }, 20);

    return () => {
      window.clearInterval(timer);
    };
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  if (!stageSupportsSuggestions) {
    return null;
  }

  return (
    <section
      data-testid="ai-suggestion-panel"
      className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.15)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-violet-100">AI itinerary guidance</h2>
          <p className="text-xs text-violet-100/80">
            Optional, context-aware suggestions for the current trip stage. Primary controls remain unchanged.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedType || isStreaming}
          onClick={() => {
            if (!selectedType) return;
            void requestSuggestion(selectedType);
          }}
          className="rounded-md bg-violet-300/20 px-2.5 py-1 text-xs font-semibold text-violet-50 ring-1 ring-violet-300/40 transition hover:bg-violet-300/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStreaming ? "Generating..." : "Regenerate"}
        </button>
      </div>

      {availableSuggestions.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableSuggestions.map((suggestionOption) => {
              const isSelected = suggestionOption.type === selectedType;
              return (
                <button
                  key={suggestionOption.type}
                  type="button"
                  onClick={() => setSelectedTypeOverride(suggestionOption.type)}
                  className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                    isSelected
                      ? "border-violet-300/70 bg-violet-300/20 text-violet-50"
                      : "border-slate-600 bg-slate-900/70 text-slate-200 hover:border-violet-300/40 hover:text-violet-100"
                  }`}
                >
                  <p className="font-semibold">{suggestionOption.label}</p>
                  <p className="text-[11px] opacity-80">{suggestionOption.subtitle}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-violet-300/35 bg-slate-950/70 p-3">
            {errorMessage ? (
              <p className="mb-2 text-xs text-amber-200">Notice: {errorMessage}</p>
            ) : null}
            <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-slate-100">
              {suggestionText || (isStreaming ? "Generating suggestions..." : "Select regenerate to refresh guidance.")}
            </pre>
            {isStreaming ? <p className="mt-2 text-[11px] text-violet-100/80">Streaming live guidance...</p> : null}
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          {stageEmptyStateMessage(tripStage)}
        </p>
      )}
    </section>
  );
}
