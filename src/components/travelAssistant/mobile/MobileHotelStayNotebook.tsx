"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterHotelUserLines,
  hotelBookedLineText,
  serializeHotelNotebook,
  type HotelNotebookReservation,
} from "@/lib/travelAssistant/hotelStayNotebook";
import {
  MOBILE_LINE_HEIGHT_PX,
  MOBILE_MIN_NOTEBOOK_LINES,
  MOBILE_NOTEBOOK,
  MOBILE_NOTEBOOK_FONT_PX,
  MOBILE_NOTEBOOK_NUM_FONT_PX,
  MOBILE_OVERLAY_SCROLL,
  MOBILE_OVERLAY_SHELL,
  notebookRuleGradient,
} from "@/lib/ui/mobileFullscreen";

interface MobileHotelStayNotebookProps {
  tripName: string;
  reservations: HotelNotebookReservation[];
  savedNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
  onReservationTap?: (id: string) => void;
}

function ensureMinLines(lines: string[]): string[] {
  const next = lines.length > 0 ? [...lines] : [""];
  while (next.length < MOBILE_MIN_NOTEBOOK_LINES) next.push("");
  return next;
}

export function MobileHotelStayNotebook({
  tripName,
  reservations,
  savedNote,
  onSave,
  onClose,
  onReservationTap,
}: MobileHotelStayNotebookProps) {
  const bookedLines = useMemo(
    () =>
      reservations.map((r) => ({
        id: r.id,
        emoji: "🏨",
        text: hotelBookedLineText(r),
      })),
    [reservations],
  );
  const bookedTexts = useMemo(() => bookedLines.map((b) => b.text), [bookedLines]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>(() =>
    ensureMinLines(filterHotelUserLines(savedNote, bookedTexts)),
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setLines(ensureMinLines(filterHotelUserLines(savedNote, bookedTexts)));
  }, [bookedTexts, savedNote]);

  const dirty = useMemo(() => {
    const savedUser = filterHotelUserLines(savedNote, bookedTexts);
    return serializeHotelNotebook(lines) !== serializeHotelNotebook(savedUser);
  }, [bookedTexts, lines, savedNote]);

  const setLine = (index: number, text: string): void => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = text;
      if (index === next.length - 1 && text.trim()) next.push("");
      return ensureMinLines(next);
    });
  };

  const removeLine = (index: number): void => {
    setLines((prev) =>
      ensureMinLines(prev.filter((_, i) => i !== index).length > 0 ? prev.filter((_, i) => i !== index) : [""]),
    );
  };

  const addLine = (): void => {
    setLines((prev) => ensureMinLines([...prev, ""]));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const persist = useCallback((): void => {
    onSave(serializeHotelNotebook(lines));
  }, [lines, onSave]);

  const handleBack = (): void => {
    if (dirty) persist();
    onClose();
  };

  const startVoice = (): void => {
    if (typeof window === "undefined") return;
    const win = window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition };
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setVoiceHint("Voice not available — tap a line and type.");
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
      setVoiceHint("Try again or type on a line.");
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
      setVoiceHint(`Added: “${transcript.slice(0, 40)}${transcript.length > 40 ? "…" : ""}"`);
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

  const lineHeight = MOBILE_LINE_HEIGHT_PX;
  const marginW = MOBILE_NOTEBOOK.marginWidthPx;
  const paperMinHeight = (bookedLines.length + lines.length + 2) * lineHeight + 160;

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#faf6ee]" style={MOBILE_OVERLAY_SHELL}>
      <div ref={scrollRef} className="min-h-0 flex-1" style={MOBILE_OVERLAY_SCROLL}>
        <header className="sticky top-0 z-10 border-b border-[#e8e0d0] bg-[#faf6ee]/98 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="min-h-[52px] min-w-[80px] text-left text-[22px] font-semibold text-[#007AFF]"
            >
              Back
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[16px] font-semibold uppercase tracking-wide text-[#8a7f6e]">Hotels</p>
              <p className="text-[26px] font-bold leading-tight text-[#1c1917]">{tripName}</p>
              <p className="text-[19px] text-[#57534e]">{bookedLines.length} booked stay{bookedLines.length === 1 ? "" : "s"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                persist();
                onClose();
              }}
              className="min-h-[52px] min-w-[80px] rounded-full bg-[#007AFF] px-5 text-[20px] font-bold text-white"
            >
              Save
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              className={`min-h-[54px] rounded-full px-6 text-[20px] font-bold ${
                listening ? "bg-red-500 text-white" : "bg-white text-[#1c1917] shadow ring-1 ring-[#e7e5e4]"
              }`}
            >
              {listening ? "Stop" : "🎤 Talk"}
            </button>
            <button
              type="button"
              onClick={addLine}
              className="min-h-[54px] rounded-full bg-white px-6 text-[20px] font-bold text-[#1c1917] shadow ring-1 ring-[#e7e5e4]"
            >
              + Line
            </button>
          </div>
          {voiceHint ? <p className="mt-2 text-center text-[18px] text-[#78716c]">{voiceHint}</p> : null}
        </header>

        <div
          className="relative w-full pb-32 pt-1"
          style={{
            minHeight: `${paperMinHeight}px`,
            backgroundColor: MOBILE_NOTEBOOK.paper,
            backgroundImage: notebookRuleGradient(lineHeight),
            boxShadow: `inset ${marginW}px 0 0 0 rgba(220, 80, 70, 0.08)`,
          }}
        >
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-red-400/45"
            style={{ left: marginW - 10 }}
            aria-hidden
          />

          {bookedLines.length > 0 ? (
            <p
              className="pl-4 font-bold uppercase tracking-wider text-emerald-700"
              style={{
                marginLeft: marginW,
                fontSize: 15,
                height: lineHeight,
                lineHeight: `${lineHeight}px`,
              }}
            >
              Booked stays
            </p>
          ) : null}

          {bookedLines.map((booked, index) => (
            <button
              key={booked.id}
              type="button"
              onClick={() => onReservationTap?.(booked.id)}
              className="flex w-full items-start gap-0 border-0 bg-transparent text-left"
              style={{ minHeight: lineHeight }}
            >
              <span
                className="shrink-0 text-right font-semibold tabular-nums text-[#78716c]"
                style={{
                  width: marginW - 10,
                  fontSize: MOBILE_NOTEBOOK_NUM_FONT_PX,
                  lineHeight: `${lineHeight}px`,
                  paddingRight: 10,
                }}
              >
                {index + 1}
              </span>
              <span
                className="min-w-0 flex-1 break-words font-medium text-[#166534]"
                style={{
                  fontSize: MOBILE_NOTEBOOK_FONT_PX,
                  lineHeight: `${lineHeight}px`,
                  paddingRight: 16,
                  paddingTop: 2,
                }}
              >
                {booked.emoji} {booked.text}
              </span>
            </button>
          ))}

          {lines.map((line, index) => {
            const lineNum = bookedLines.length + index + 1;
            return (
              <div key={`edit-${index}`} className="flex w-full items-start" style={{ minHeight: lineHeight }}>
                <span
                  className="shrink-0 text-right font-semibold tabular-nums text-[#78716c]"
                  style={{
                    width: marginW - 10,
                    fontSize: MOBILE_NOTEBOOK_NUM_FONT_PX,
                    lineHeight: `${lineHeight}px`,
                    paddingRight: 10,
                  }}
                >
                  {lineNum}
                </span>
                <input
                  type="text"
                  enterKeyHint="next"
                  value={line}
                  placeholder={
                    index === 0 && bookedLines.length === 0 && !line
                      ? "Type hotel plans, addresses, notes…"
                      : ""
                  }
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
                  onChange={(e) => setLine(index, e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent font-normal text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:ring-0"
                  style={{
                    fontSize: MOBILE_NOTEBOOK_FONT_PX,
                    minHeight: lineHeight,
                    lineHeight: `${lineHeight}px`,
                    paddingRight: line.trim() ? 48 : 16,
                    paddingTop: 2,
                  }}
                />
                {line.trim() ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="shrink-0 pr-4 text-[22px] font-bold text-red-500"
                    style={{ lineHeight: `${lineHeight}px` }}
                    aria-label="Delete line"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
