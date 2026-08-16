"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dayActivityLinesEqual,
  normalizeDayActivityLines,
  planDayEditorTitle,
  splitPastedDayLines,
} from "@/lib/travelAssistant/planDayEdit";
import {
  MOBILE_OVERLAY_SCROLL,
  MOBILE_OVERLAY_SHELL,
} from "@/lib/ui/mobileFullscreen";

interface PlanDayEditSheetProps {
  dateKey: string;
  heading: string;
  location?: string | null;
  stayFacts: string[];
  activityFacts: string[];
  bullets: string[];
  onSave: (bullets: string[]) => void;
  onClose: () => void;
}

function emptyPad(lines: string[]): string[] {
  const next = normalizeDayActivityLines(lines);
  return next.length > 0 ? [...next, ""] : [""];
}

export function PlanDayEditSheet({
  dateKey,
  heading,
  location,
  stayFacts,
  activityFacts,
  bullets,
  onSave,
  onClose,
}: PlanDayEditSheetProps) {
  const [lines, setLines] = useState<string[]>(() => emptyPad(bullets));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const title = planDayEditorTitle(heading, location);

  useEffect(() => {
    setLines(emptyPad(bullets));
  }, [bullets]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const setLine = (index: number, text: string): void => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = text;
      if (index === next.length - 1 && text.trim()) next.push("");
      return next.length > 0 ? next : [""];
    });
  };

  const removeLine = (index: number): void => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const persistAndClose = useCallback((): void => {
    const next = normalizeDayActivityLines(lines);
    if (!dayActivityLinesEqual(next, bullets)) {
      onSave(next);
    }
    onClose();
  }, [bullets, lines, onClose, onSave]);

  const startVoice = (): void => {
    if (typeof window === "undefined") return;
    const win = window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition };
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setVoiceHint("Voice isn’t available here — type or paste instead.");
      return;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setListening(true);
      setVoiceHint("Listening…");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setVoiceHint("Try again, or type a line.");
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setLines((prev) => {
        const idx = focusedIndex ?? prev.findIndex((line) => !line.trim());
        const target = idx >= 0 ? idx : prev.length - 1;
        const next = [...prev];
        next[target] = next[target]?.trim() ? `${next[target]} ${transcript}` : transcript;
        if (target === next.length - 1) next.push("");
        return next;
      });
      setVoiceHint(`Added: “${transcript.slice(0, 48)}${transcript.length > 48 ? "…" : ""}”`);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoice = (): void => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  const applyPaste = (): void => {
    const incoming = splitPastedDayLines(pasteText);
    if (incoming.length === 0) return;
    setLines((prev) => emptyPad([...normalizeDayActivityLines(prev), ...incoming]));
    setPasteText("");
    setPasteOpen(false);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex h-[100dvh] max-h-[100dvh] flex-col bg-[#FAF6EF]"
      style={MOBILE_OVERLAY_SHELL}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-day-edit-title"
      data-date-key={dateKey}
    >
      <div ref={scrollRef} className="min-h-0 flex-1" style={MOBILE_OVERLAY_SCROLL}>
        <header className="sticky top-0 z-10 border-b border-[#E8E0D4] bg-[#FAF6EF]/98 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[52px] min-w-[72px] text-left text-[20px] font-semibold text-[#007AFF]"
            >
              Cancel
            </button>
            <h2
              id="plan-day-edit-title"
              className="min-w-0 flex-1 text-center text-[22px] font-bold leading-tight text-[#1D1D1F]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={persistAndClose}
              className="min-h-[52px] min-w-[72px] rounded-full bg-[#007AFF] px-5 text-[18px] font-bold text-white"
            >
              Done
            </button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              className={`min-h-[52px] rounded-full px-5 text-[18px] font-bold ${
                listening ? "bg-[#FF3B30] text-white" : "bg-white text-[#1D1D1F] shadow-sm ring-1 ring-[#E8E0D4]"
              }`}
            >
              {listening ? "Stop" : "Talk"}
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen((open) => !open)}
              className="min-h-[52px] rounded-full bg-white px-5 text-[18px] font-bold text-[#1D1D1F] shadow-sm ring-1 ring-[#E8E0D4]"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={() => setLines([""])}
              className="min-h-[52px] rounded-full bg-white px-5 text-[18px] font-bold text-[#1D1D1F] shadow-sm ring-1 ring-[#E8E0D4]"
            >
              Clear day
            </button>
          </div>
          {voiceHint ? (
            <p className="mt-2 text-center text-[16px] text-[#6E6E73]">{voiceHint}</p>
          ) : null}
        </header>

        <div className="px-5 pb-28 pt-4">
          {stayFacts.length > 0 || activityFacts.length > 0 ? (
            <section className="mb-5 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-[#E8E0D4]">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#8E8E93]">On the books</p>
              <ul className="mt-2 space-y-1.5 text-[17px] leading-snug text-[#1D1D1F]">
                {[...stayFacts, ...activityFacts].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {pasteOpen ? (
            <div className="mb-5 space-y-3">
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3 text-[20px] leading-snug text-[#1D1D1F] outline-none"
                placeholder={"Boat tour — 10 am GetYourGuide\nGelato at Martinucci"}
              />
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={applyPaste}
                className="min-h-[52px] w-full rounded-full bg-[#007AFF] text-[18px] font-bold text-white disabled:opacity-40"
              >
                Add pasted lines
              </button>
            </div>
          ) : null}

          <ul className="space-y-3">
            {lines.map((line, index) => (
              <li key={`day-line-${index}`} className="flex items-start gap-2">
                <span className="mt-3 text-[20px] text-[#1D1D1F]" aria-hidden>
                  •
                </span>
                <input
                  type="text"
                  enterKeyHint="next"
                  value={line}
                  placeholder={index === 0 ? "What are you doing this day?" : "Another line"}
                  onFocus={() => setFocusedIndex(index)}
                  onChange={(event) => setLine(index, event.target.value)}
                  className="min-h-[52px] min-w-0 flex-1 rounded-2xl bg-white px-4 text-[20px] leading-snug text-[#1D1D1F] outline-none ring-1 ring-[#E8E0D4]"
                />
                {line.trim() ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="min-h-[52px] shrink-0 px-2 text-[20px] font-semibold text-[#8E8E93]"
                    aria-label="Delete line"
                  >
                    ✕
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
