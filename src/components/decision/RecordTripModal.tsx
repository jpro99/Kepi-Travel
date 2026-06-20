"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RECORD_TRIP_EXAMPLE } from "@/lib/decision/intentParser";

interface RecordTripModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export function RecordTripModal({ open, loading = false, onClose, onSubmit }: RecordTripModalProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  /** Text in the box when this recording session started. */
  const baseTextRef = useRef("");
  /** Final transcript chunks for the current session only. */
  const sessionFinalRef = useRef("");
  const listeningRef = useRef(false);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    if (!open) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
      setListening(false);
      setVoiceNote(null);
    }
  }, [open]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    setListening(false);
    setVoiceNote("Recording stopped — review below, then tap Build my trip.");
  }, []);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setVoiceNote("Voice isn't supported in this browser — type your trip instead.");
      return;
    }

    baseTextRef.current = text.trim();
    sessionFinalRef.current = "";
    listeningRef.current = true;
    setListening(true);
    setVoiceNote("Recording… describe your whole trip, then tap Stop.");

    // Use NON-continuous mode — most reliable cross-platform approach.
    // Each phrase ends naturally on pause; we auto-restart for the next.
    // This avoids all Android Chrome bugs with continuous + resultIndex.
    const startChunk = () => {
      if (!listeningRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = new SpeechRecognitionImpl() as any;
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = false;       // stop after each natural pause
      r.maxAlternatives = 1;
      recognitionRef.current = r;

      // What the user committed in previous chunks
      const committed = () =>
        [baseTextRef.current, sessionFinalRef.current].filter(Boolean).join(" ");

      r.onresult = (event: any) => {
        // event.results is small (one phrase worth) — no index tracking needed
        // The LAST result is the authoritative transcript; earlier ones are interim
        const lastResult = event.results[event.results.length - 1];
        const chunk = (lastResult?.[0]?.transcript ?? "").trim();
        if (!chunk) return;

        if (lastResult?.isFinal) {
          // Commit this phrase permanently
          sessionFinalRef.current = sessionFinalRef.current
            ? `${sessionFinalRef.current} ${chunk}`
            : chunk;
          setText(committed());
        } else {
          // Show live interim without committing
          setText(`${committed()} ${chunk}`.trim());
        }
        setVoiceNote("Recording… tap Stop when you're done.");
      };

      r.onerror = (event: Event & { error?: string }) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        setVoiceNote("Voice hit a snag — you can keep typing instead.");
        listeningRef.current = false;
        setListening(false);
        recognitionRef.current = null;
      };

      r.onend = () => {
        recognitionRef.current = null;
        if (listeningRef.current) {
          // Natural pause — restart for next phrase
          startChunk();
        } else {
          setListening(false);
          setVoiceNote("Recording ended — tap Start recording to add more, or build your trip.");
        }
      };

      try {
        r.start();
      } catch {
        listeningRef.current = false;
        setListening(false);
        setVoiceNote("Couldn't start the microphone — check browser permissions.");
      }
    };

    startChunk();
  }, [text, stopListening]);

  const toggleRecording = (): void => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleClose = () => {
    stopListening();
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    stopListening();
    onSubmit(trimmed);
    setText("");
    setVoiceNote(null);
  };

  const loadExample = () => {
    stopListening();
    setText(RECORD_TRIP_EXAMPLE);
    setVoiceNote("Example loaded — edit or replace, then build.");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-trip-title"
      onClick={handleClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/15 bg-[#0b1f3a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#f4c95d]">Voice or type</p>
            <h2 id="record-trip-title" className="mt-1 text-xl font-bold text-white">
              Record my trip
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Tap <span className="font-semibold text-white/80">Start recording</span>, describe your trip, then tap{" "}
          <span className="font-semibold text-white/80">Stop</span>. No need to hold the button.
        </p>

        <ul className="mt-3 space-y-1 text-xs text-white/45">
          <li>· Origin &amp; return airport area</li>
          <li>· Each city and how many days</li>
          <li>· Fly-out and fly-home dates</li>
          <li>· Hyatt, Alaska, budget, etc.</li>
        </ul>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={loading}
            aria-pressed={listening}
            className={`flex h-12 flex-1 select-none items-center justify-center gap-2 rounded-2xl text-sm font-black transition-all touch-manipulation ${
              listening
                ? "bg-[#f4c95d] text-[#0b1f3a]"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
            style={listening ? { animation: "recordPulse 1.2s ease-in-out infinite" } : undefined}
          >
            {listening ? "■ Stop recording" : "🎙 Start recording"}
          </button>
        </div>

        {voiceNote && (
          <p className="mt-2 text-xs font-medium text-sky-200/90">{voiceNote}</p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={RECORD_TRIP_EXAMPLE}
          className="mt-4 w-full resize-y rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-white placeholder:text-white/30 focus:border-[#f4c95d]/50 focus:outline-none focus:ring-1 focus:ring-[#f4c95d]/25"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadExample}
            className="rounded-xl bg-white/8 px-3 py-2 text-xs font-bold text-white/75 hover:bg-white/12"
          >
            Load example
          </button>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="mt-4 w-full rounded-2xl bg-[#f4c95d] py-3.5 text-sm font-black text-[#0b1f3a] transition-all hover:bg-[#ffe29a] disabled:opacity-50"
        >
          {loading ? "Building your plan…" : "Build my trip →"}
        </button>

        <style>{`@keyframes recordPulse{0%,100%{opacity:1}50%{opacity:0.7}}`}</style>
      </div>
    </div>
  );
}
