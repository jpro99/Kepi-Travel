"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatDayHeading,
  parseDayLinesForEditor,
  serializeDayLinesForEditor,
} from "@/lib/travelAssistant/dayPlanLines";

const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

const LINE_HEIGHT_PX = 44;
const MIN_LINES = 14;

interface BookedLine {
  id: string;
  text: string;
  emoji: string;
}

interface MobileLinedDayEditorProps {
  dateKey: string;
  dayIndex: number;
  stayCity?: string | null;
  savedNote: string;
  bookedLines: BookedLine[];
  onSave: (note: string) => void;
  onBack: () => void;
  onBookedTap?: (id: string) => void;
}

function ensureMinLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length < MIN_LINES) next.push("");
  return next;
}

export function MobileLinedDayEditor({
  dateKey,
  dayIndex,
  stayCity,
  savedNote,
  bookedLines,
  onSave,
  onBack,
  onBookedTap,
}: MobileLinedDayEditorProps) {
  const heading = formatDayHeading(dateKey);
  const [lines, setLines] = useState<string[]>(() =>
    ensureMinLines(parseDayLinesForEditor(savedNote).filter((l) => l.trim() || parseDayLinesForEditor(savedNote).length === 1)),
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const parsed = parseDayLinesForEditor(savedNote);
    setLines(ensureMinLines(parsed.length > 0 ? parsed : [""]));
  }, [dateKey, savedNote]);

  const dirty = useMemo(
    () => serializeDayLinesForEditor(lines) !== serializeDayLinesForEditor(parseDayLinesForEditor(savedNote)),
    [lines, savedNote],
  );

  const setLine = (index: number, text: string): void => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = text;
      if (index === next.length - 1 && text.trim()) next.push("");
      return ensureMinLines(next);
    });
  };

  const removeLine = (index: number): void => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return ensureMinLines(next.length > 0 ? next : [""]);
    });
  };

  const addLine = (): void => {
    setLines((prev) => ensureMinLines([...prev, ""]));
    setFocusedIndex(lines.length);
  };

  const persist = useCallback((): void => {
    onSave(serializeDayLinesForEditor(lines));
  }, [lines, onSave]);

  const handleBack = (): void => {
    if (dirty) persist();
    onBack();
  };

  const startVoice = (): void => {
    if (typeof window === "undefined") return;
    const win = window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition };
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setVoiceHint("Voice not available in this browser — type on a line instead.");
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
      setVoiceHint("Listening… tap mic to stop");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setVoiceHint("Could not hear that — try again.");
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setLines((prev) => {
        const idx = focusedIndex ?? prev.findIndex((l) => !l.trim());
        const target = idx >= 0 ? idx : prev.length - 1;
        const next = [...prev];
        next[target] = next[target]?.trim() ? `${next[target]} ${transcript}` : transcript;
        return ensureMinLines(next);
      });
      setVoiceHint(`Added: “${transcript.slice(0, 48)}${transcript.length > 48 ? "…" : ""}"`);
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

  const lineNumberOffset = bookedLines.length;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-[#F2F2F7] dark:bg-black"
      style={{ fontFamily: APPLE_FONT, paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="shrink-0 border-b border-black/[0.08] bg-[#F2F2F7]/95 px-4 py-3 backdrop-blur-xl dark:border-white/[0.08] dark:bg-black/90">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="min-h-[44px] rounded-full px-3 text-[17px] font-semibold text-[#007AFF]"
          >
            Back
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[13px] font-bold uppercase tracking-wide text-slate-500">Day {dayIndex + 1}</p>
            <p className="truncate text-[17px] font-bold text-slate-900 dark:text-white">{heading.weekday}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              persist();
              onBack();
            }}
            className="min-h-[44px] rounded-full bg-[#007AFF] px-4 text-[17px] font-bold text-white"
          >
            Save
          </button>
        </div>
        {stayCity ? (
          <p className="mx-auto mt-2 max-w-lg text-center text-[15px] font-medium text-slate-600 dark:text-slate-300">
            📍 {stayCity}
          </p>
        ) : null}
        <div className="mx-auto mt-3 flex max-w-lg justify-center gap-2">
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className={`flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[15px] font-bold ${
              listening
                ? "bg-red-500 text-white"
                : "bg-white text-slate-800 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-800 dark:text-white"
            }`}
          >
            {listening ? "■ Stop" : "🎤 Talk"}
          </button>
          <button
            type="button"
            onClick={addLine}
            className="min-h-[44px] rounded-full bg-white px-4 text-[15px] font-bold text-slate-800 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-800 dark:text-white"
          >
            + Line
          </button>
        </div>
        {voiceHint ? <p className="mt-2 text-center text-[13px] text-slate-500">{voiceHint}</p> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className="relative mx-auto min-h-full max-w-lg px-4 py-4 pb-32"
          style={{
            backgroundColor: "#faf6ee",
            backgroundImage: `repeating-linear-gradient(
              transparent,
              transparent ${LINE_HEIGHT_PX - 1}px,
              rgba(180, 170, 150, 0.45) ${LINE_HEIGHT_PX - 1}px,
              rgba(180, 170, 150, 0.45) ${LINE_HEIGHT_PX}px
            )`,
            boxShadow: "inset 48px 0 0 0 rgba(220, 80, 70, 0.12)",
          }}
        >
          <div className="absolute left-[52px] top-0 bottom-0 w-px bg-red-400/35" aria-hidden />

          {bookedLines.length > 0 ? (
            <div className="mb-2 space-y-0">
              <p className="mb-2 pl-12 text-[13px] font-bold uppercase tracking-wide text-emerald-800/80">
                Confirmed
              </p>
              {bookedLines.map((booked, index) => (
                <button
                  key={booked.id}
                  type="button"
                  onClick={() => onBookedTap?.(booked.id)}
                  className="flex w-full items-start gap-3 text-left"
                  style={{ minHeight: LINE_HEIGHT_PX }}
                >
                  <span className="w-8 shrink-0 pt-2 text-right text-[15px] font-bold text-emerald-800/60">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-2 text-[19px] font-semibold leading-tight text-emerald-950">
                    {booked.emoji} {booked.text}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-0">
            {lines.map((line, index) => {
              const lineNum = lineNumberOffset + index + 1;
              const isFocused = focusedIndex === index;
              return (
                <div
                  key={`line-${index}`}
                  className="group flex items-start gap-2"
                  style={{ minHeight: LINE_HEIGHT_PX }}
                >
                  <span className="w-8 shrink-0 pt-2 text-right text-[15px] font-bold text-slate-500/80">
                    {lineNum}
                  </span>
                  <input
                    type="text"
                    value={line}
                    placeholder={index === 0 && !line ? "Type your plan for this day…" : ""}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
                    onChange={(e) => setLine(index, e.target.value)}
                    className={`min-w-0 flex-1 border-0 bg-transparent pt-2 text-[19px] font-medium leading-tight text-slate-900 placeholder:text-slate-400/80 focus:outline-none ${
                      isFocused ? "ring-0" : ""
                    }`}
                    style={{ height: LINE_HEIGHT_PX }}
                  />
                  {line.trim() ? (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="shrink-0 px-2 pt-2 text-[13px] font-bold text-red-500/80 opacity-70"
                      aria-label="Delete line"
                    >
                      ✕
                    </button>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
