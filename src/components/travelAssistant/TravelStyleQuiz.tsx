"use client";

import { useMemo, useState } from "react";
import {
  TRAVEL_STYLE_LABELS,
  TRAVEL_STYLE_QUICK_QUESTION,
  profileFromTravelStyleMode,
  createSkippedTravelStyle,
  effectiveDominantMode,
} from "@/lib/travelStyle/travelStyleQuiz";
import type { TravelStyleMode, TravelStyleProfile, TravelerGenome } from "@/lib/traveler/types";

interface TravelStyleQuizProps {
  onComplete: (profile: TravelStyleProfile) => void;
  onSkip: () => void;
}

export function TravelStyleQuiz({ onComplete, onSkip }: TravelStyleQuizProps) {
  const [selected, setSelected] = useState<TravelStyleMode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = (mode: TravelStyleMode): void => {
    if (submitting) return;
    setSelected(mode);
    setSubmitting(true);
    onComplete(profileFromTravelStyleMode(mode));
  };

  return (
    <div className="fixed inset-0 z-[100050] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-style-title"
        className="flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col rounded-t-3xl bg-white shadow-xl dark:bg-slate-900 sm:h-auto sm:max-h-[min(90dvh,640px)] sm:max-w-lg sm:rounded-3xl"
      >
        <header className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Travel style</p>
          <h2 id="travel-style-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            How do you like to travel?
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            One tap — Kepi tunes how chatty and detailed your guidance feels.
          </p>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <fieldset className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {TRAVEL_STYLE_QUICK_QUESTION.prompt}
            </legend>
            <div className="mt-3 space-y-2">
              {TRAVEL_STYLE_QUICK_QUESTION.options.map((option) => {
                const active = selected === option.mode;
                const label = TRAVEL_STYLE_LABELS[option.mode];
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSelect(option.mode)}
                    className={`w-full rounded-2xl px-4 py-3.5 text-left transition-colors touch-manipulation ${
                      active
                        ? "bg-sky-600 text-white"
                        : "bg-slate-50 text-slate-800 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className={`mt-0.5 block text-xs ${active ? "text-sky-100" : "text-slate-500 dark:text-slate-400"}`}>
                      {label.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer
          className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSkip()}
            className="w-full rounded-xl border border-slate-300 py-3.5 text-sm font-semibold dark:border-slate-600"
          >
            Skip for now
          </button>
        </footer>
      </section>
    </div>
  );
}

export function TravelStyleBadge({ profile }: { profile: TravelStyleProfile | null | undefined }) {
  const label = useMemo(() => {
    if (!profile?.completed || profile.skipped) return null;
    const mode = effectiveDominantMode(profile);
    if (!mode) return null;
    return TRAVEL_STYLE_LABELS[mode];
  }, [profile]);

  if (!label) return null;

  return (
    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
      {label.emoji} {label.guidanceLabel} — {label.tagline}{" "}
      <a href="/settings/travel-profile#travel-guidance" className="font-semibold text-sky-700 underline">
        Adjust
      </a>
    </p>
  );
}

export async function saveTravelStyleToGenome(profile: TravelStyleProfile): Promise<void> {
  const res = await fetch("/api/traveler/genome");
  if (!res.ok) throw new Error("Could not load profile");
  const data = (await res.json()) as { genome: TravelerGenome };
  await fetch("/api/traveler/genome", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save",
      genome: { ...data.genome, travelStyle: profile },
    }),
  });
}

export async function skipTravelStyleOnGenome(): Promise<void> {
  await saveTravelStyleToGenome(createSkippedTravelStyle());
}
