"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";

interface HotelStayProfileCardProps {
  onSaved?: (summary: string | null) => void;
}

export function HotelStayProfileCard({ onSaved }: HotelStayProfileCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const sessionFinalRef = useRef("");
  const listeningRef = useRef(false);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/hotels/profile", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          profile?: HotelStayProfile;
          summary?: string | null;
        };
        if (cancelled) return;
        setText(payload.profile?.freeTextSummary ?? "");
        setSummary(payload.summary ?? null);
        setCompleted(Boolean(payload.profile?.completed));
        if (!payload.profile?.completed) setExpanded(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    setListening(false);
    setVoiceNote("Recording stopped — review and save when ready.");
  }, []);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setVoiceNote("Voice isn't supported here — type your preferences instead.");
      return;
    }

    baseTextRef.current = text.trim();
    sessionFinalRef.current = "";
    listeningRef.current = true;
    setListening(true);
    setVoiceNote("Describe your ideal hotel — elevator, ocean, breakfast, quality…");

    const startChunk = () => {
      if (!listeningRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = new SpeechRecognitionImpl() as any;
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = false;
      recognitionRef.current = r;

      r.onresult = (event: { results: SpeechRecognitionResultList }) => {
        let interim = "";
        for (let i = event.results.length - 1; i >= 0; i--) {
          const chunk = event.results[i]?.[0]?.transcript ?? "";
          if (event.results[i]?.isFinal) {
            sessionFinalRef.current = `${sessionFinalRef.current} ${chunk}`.trim();
          } else {
            interim = chunk;
          }
        }
        const merged = [baseTextRef.current, sessionFinalRef.current, interim].filter(Boolean).join(" ").trim();
        setText(merged);
      };

      r.onerror = (event: { error?: string }) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        setVoiceNote("Voice error — try again or type instead.");
        stopListening();
      };

      r.onend = () => {
        if (listeningRef.current) startChunk();
      };

      try {
        r.start();
      } catch {
        stopListening();
      }
    };

    startChunk();
  }, [stopListening, text]);

  const handleSave = async (): Promise<void> => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/hotels/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeTextSummary: text.trim(), completed: true }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { summary?: string | null };
      setSummary(payload.summary ?? null);
      setCompleted(true);
      setExpanded(false);
      onSaved?.(payload.summary ?? null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />;
  }

  if (completed && !expanded) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Your stay style</p>
            <p className="mt-1 text-sm text-emerald-950 dark:text-emerald-100">{summary ?? "Saved — Kepi applies this to every hotel search."}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 text-xs font-semibold text-emerald-800 underline dark:text-emerald-200"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 dark:border-sky-800 dark:bg-sky-950/30">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">Tell Kepi once</p>
      <p className="mt-1 text-sm text-sky-950 dark:text-sky-100">
        Describe a good hotel for you — elevator, ocean view, breakfast, no stairs, quality, near train. We remember forever.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder="Example: No stairs — I need an elevator. Balcony near the ocean if possible. Close to train station. Quality, clean hotels. Free breakfast is nice but not required."
        className="mt-3 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-300 focus-visible:ring-2 dark:border-sky-700 dark:bg-slate-950 dark:text-white"
      />
      {voiceNote ? <p className="mt-2 text-xs text-sky-800 dark:text-sky-200">{voiceNote}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (listening ? stopListening() : startListening())}
          className="rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-800 dark:border-sky-600 dark:bg-slate-900 dark:text-sky-200"
        >
          {listening ? "Stop mic" : "🎤 Speak"}
        </button>
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={() => void handleSave()}
          className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save my stay style"}
        </button>
        {completed ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
