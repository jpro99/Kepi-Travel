"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  appendPastedDayLines,
  dayActivityLinesEqual,
  insertPastedDayLines,
  moveDayActivityLine,
  normalizeDayActivityLines,
  padDayActivityLines,
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
  const [lines, setLines] = useState<string[]>(() => padDayActivityLines(bullets));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [undoLines, setUndoLines] = useState<string[] | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const title = planDayEditorTitle(heading, location);

  useEffect(() => {
    setLines(padDayActivityLines(bullets));
    setPasteText("");
    setUndoLines(null);
  }, [dateKey]);

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

  const snapshot = (prev: string[]): void => {
    setUndoLines(prev);
  };

  const removeLine = (index: number): void => {
    setLines((prev) => {
      snapshot(prev);
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
    setVoiceHint("Line deleted — tap Undo if that was a mistake.");
  };

  const undoLast = (): void => {
    if (!undoLines) return;
    setLines(undoLines);
    setUndoLines(null);
    setVoiceHint("Restored the last change.");
  };

  const applyPastedText = (text: string, atIndex?: number): boolean => {
    const incoming = splitPastedDayLines(text);
    if (incoming.length === 0) return false;
    setLines((prev) =>
      atIndex === undefined
        ? appendPastedDayLines(prev, text)
        : insertPastedDayLines(prev, atIndex, text),
    );
    setPasteText("");
    setPasteOpen(false);
    setVoiceHint(
      incoming.length === 1 ? `Added: “${incoming[0]}”` : `Pasted ${incoming.length} lines.`,
    );
    return true;
  };

  const persistAndClose = useCallback((): void => {
    const withPaste = pasteText.trim()
      ? normalizeDayActivityLines(appendPastedDayLines(lines, pasteText))
      : normalizeDayActivityLines(lines);
    if (!dayActivityLinesEqual(withPaste, bullets)) {
      onSave(withPaste);
    }
    onClose();
  }, [bullets, lines, onClose, onSave, pasteText]);

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

  const pasteFromClipboard = (): void => {
    const applyOrOpen = (text: string): void => {
      if (applyPastedText(text, focusedIndex ?? undefined)) return;
      setPasteOpen(true);
      setVoiceHint("Paste your lines here, then they drop onto this day.");
      requestAnimationFrame(() => pasteRef.current?.focus());
    };
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      applyOrOpen("");
      return;
    }
    void navigator.clipboard
      .readText()
      .then((text) => applyOrOpen(text))
      .catch(() => applyOrOpen(""));
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
              onClick={pasteFromClipboard}
              className="min-h-[52px] rounded-full bg-white px-5 text-[18px] font-bold text-[#1D1D1F] shadow-sm ring-1 ring-[#E8E0D4]"
            >
              Paste
            </button>
            {undoLines ? (
              <button
                type="button"
                onClick={undoLast}
                className="min-h-[52px] rounded-full bg-[#007AFF] px-5 text-[18px] font-bold text-white"
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLines((prev) => {
                    snapshot(prev);
                    return [""];
                  });
                  setVoiceHint("Day cleared — tap Undo to put the lines back.");
                }}
                className="min-h-[52px] rounded-full bg-white px-5 text-[18px] font-bold text-[#1D1D1F] shadow-sm ring-1 ring-[#E8E0D4]"
              >
                Clear day
              </button>
            )}
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
                ref={pasteRef}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                onPaste={(event) => {
                  const text = event.clipboardData?.getData("text") ?? "";
                  if (!splitPastedDayLines(text).length) return;
                  event.preventDefault();
                  applyPastedText(text, focusedIndex ?? undefined);
                }}
                rows={6}
                className="w-full rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3 text-[20px] leading-snug text-[#1D1D1F] outline-none"
                placeholder={"Paste here — test one two three\nor several lines from Notes"}
              />
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={() => applyPastedText(pasteText, focusedIndex ?? undefined)}
                className="min-h-[52px] w-full rounded-full bg-[#007AFF] text-[18px] font-bold text-white disabled:opacity-40"
              >
                Add pasted lines
              </button>
            </div>
          ) : null}

          <ul className="space-y-3">
            {lines.map((line, index) => (
              <li
                key={`day-line-${index}`}
                className={`flex items-start gap-2 ${dragFrom === index ? "opacity-60" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragFrom === null || dragFrom === index) return;
                  setLines((prev) => moveDayActivityLine(prev, dragFrom, index));
                  setDragFrom(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragFrom(null);
                }}
              >
                <button
                  type="button"
                  draggable
                  aria-label="Drag to reorder"
                  onDragStart={() => {
                    snapshot(lines);
                    setDragFrom(index);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  className="mt-1 min-h-[52px] min-w-[36px] cursor-grab text-[22px] text-[#8E8E93] active:cursor-grabbing"
                >
                  ☰
                </button>
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => {
                      snapshot(lines);
                      setLines((prev) => moveDayActivityLine(prev, index, index - 1));
                    }}
                    className="min-h-[26px] px-1 text-[16px] font-bold text-[#007AFF] disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index >= lines.length - 1}
                    onClick={() => {
                      snapshot(lines);
                      setLines((prev) => moveDayActivityLine(prev, index, index + 1));
                    }}
                    className="min-h-[26px] px-1 text-[16px] font-bold text-[#007AFF] disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>
                <span className="mt-3 text-[20px] text-[#1D1D1F]" aria-hidden>
                  •
                </span>
                <textarea
                  rows={1}
                  enterKeyHint="next"
                  value={line}
                  placeholder={index === 0 ? "Type or paste what you’re doing" : "Another line — or paste"}
                  onFocus={() => setFocusedIndex(index)}
                  onChange={(event) => setLine(index, event.target.value)}
                  onPaste={(event) => {
                    const text = event.clipboardData?.getData("text") ?? "";
                    const incoming = splitPastedDayLines(text);
                    if (incoming.length === 0) return;
                    if (incoming.length === 1 && !text.includes("\n")) return;
                    event.preventDefault();
                    snapshot(lines);
                    applyPastedText(text, index);
                  }}
                  className="min-h-[52px] min-w-0 flex-1 resize-none rounded-2xl bg-white px-4 py-3 text-[20px] leading-snug text-[#1D1D1F] outline-none ring-1 ring-[#E8E0D4]"
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
