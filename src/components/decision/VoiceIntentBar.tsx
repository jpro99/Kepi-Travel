"use client";

import type { CounterfactualMutation } from "@/lib/decision/types";
import { useCallback, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceIntentBarProps {
  onMutation: (mutation: CounterfactualMutation, utterance: string) => void;
  disabled?: boolean;
}

function parseVoiceMutation(text: string): CounterfactualMutation | null {
  const lower = text.toLowerCase();
  if (lower.includes("week earlier") || lower.includes("leave earlier")) {
    return { dateShiftDays: -7 };
  }
  if (lower.includes("week later") || lower.includes("leave later")) {
    return { dateShiftDays: 7 };
  }
  if (lower.includes("more comfort") || lower.includes("prioritize comfort")) {
    return { priorityComfort: 0.85 };
  }
  if (lower.includes("save money") || lower.includes("prioritize value")) {
    return { priorityComfort: 0.25 };
  }
  if (lower.includes("willing to reposition") || lower.includes("yes reposition")) {
    return { willingToReposition: true };
  }
  if (lower.includes("no reposition") || lower.includes("direct only")) {
    return { willingToReposition: false };
  }
  return null;
}

export function VoiceIntentBar({ onMutation, disabled }: VoiceIntentBarProps) {
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
      setTranscript("Voice not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join("")
        .trim();
      setTranscript(text);
      if (event.results[event.results.length - 1]?.isFinal) {
        const mutation = parseVoiceMutation(text);
        if (mutation) onMutation(mutation, text);
        stopListening();
      }
    };

    recognition.onerror = () => stopListening();
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }, [disabled, onMutation, stopListening]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-3 py-2 backdrop-blur-sm">
      <Button
        type="button"
        size="icon"
        variant={listening ? "destructive" : "secondary"}
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        aria-label={listening ? "Stop listening" : "Start voice input"}
      >
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
      <p className="min-h-[1.25rem] flex-1 truncate text-sm text-muted-foreground">
        {transcript || "Try: “What if I leave a week earlier?” or “Prioritize comfort”"}
      </p>
    </div>
  );
}
