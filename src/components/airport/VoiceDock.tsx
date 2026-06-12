"use client";

import { routeLocalVoiceIntent } from "@/lib/airportNav/intentRouter";
import type { VoiceNavIntent } from "@/lib/airportNav/types";
import { useCallback, useRef, useState } from "react";

interface VoiceDockProps {
  onIntent: (intent: VoiceNavIntent) => void;
  disabled?: boolean;
}

export function VoiceDock({ onIntent, disabled }: VoiceDockProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (disabled) return;
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
    if (!SpeechRecognitionCtor) {
      onIntent({
        intent: "fallthrough_concierge",
        slots: { utterance: "voice unavailable" },
        confidence: 0.2,
        source: "local_router",
        spokenResponse: "Voice input is not supported in this browser.",
      });
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      setTranscript(text);
      if (event.results[event.results.length - 1]?.isFinal && text) {
        const local = routeLocalVoiceIntent(text);
        if (local) {
          onIntent(local);
        } else {
          void fetch("/api/airport-nav/voice-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ utterance: text }),
          })
            .then((response) => response.json())
            .then((payload: { intent: VoiceNavIntent }) => onIntent(payload.intent))
            .catch(() => {
              onIntent({
                intent: "fallthrough_concierge",
                slots: { utterance: text },
                confidence: 0.3,
                source: "local_router",
              });
            });
        }
        stopListening();
      }
    };

    recognition.onerror = () => stopListening();
    recognition.onend = () => setListening(false);

    setListening(true);
    setTranscript("");
    recognition.start();
  }, [disabled, onIntent, stopListening]);

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-50 flex max-w-[min(100%,280px)] flex-col items-end gap-2">
      {transcript ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 backdrop-blur-md">
          {transcript}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={listening ? "Stop listening" : "Hold to speak"}
        disabled={disabled}
        onMouseDown={startListening}
        onMouseUp={stopListening}
        onTouchStart={startListening}
        onTouchEnd={stopListening}
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/15 shadow-xl transition ${
          listening
            ? "bg-red-500/90 ring-4 ring-red-300/30"
            : "bg-sky-600/95 hover:bg-sky-500"
        }`}
      >
        <span className="text-xl">{listening ? "◼" : "🎙"}</span>
      </button>
    </div>
  );
}
