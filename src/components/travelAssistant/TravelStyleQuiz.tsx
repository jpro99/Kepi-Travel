"use client";

import { useMemo, useState } from "react";
import {
  TRAVEL_STYLE_LABELS,
  TRAVEL_STYLE_QUESTIONS,
  scoreTravelStyleAnswers,
  createSkippedTravelStyle,
  effectiveDominantMode,
} from "@/lib/travelStyle/travelStyleQuiz";
import type { TravelStyleMode, TravelStyleProfile, TravelerGenome } from "@/lib/traveler/types";

interface TravelStyleQuizProps {
  onComplete: (profile: TravelStyleProfile) => void;
  onSkip: () => void;
}

export function TravelStyleQuiz({ onComplete, onSkip }: TravelStyleQuizProps) {
  const [answers, setAnswers] = useState<Partial<Record<string, TravelStyleMode>>>({});
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = TRAVEL_STYLE_QUESTIONS.every((q) => answers[q.id]);

  const handleSubmit = (): void => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    const ordered = TRAVEL_STYLE_QUESTIONS.map((q) => answers[q.id]!);
    onComplete(scoreTravelStyleAnswers(ordered));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Travel style</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">How do you like to travel?</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Ten travel scenarios — Kepi picks your guidance style: fast, smart, calm, or structured.
        </p>

        <div className="mt-4 space-y-4">
          {TRAVEL_STYLE_QUESTIONS.map((question, index) => (
            <fieldset key={question.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {index + 1}. {question.prompt}
              </legend>
              <div className="mt-2 space-y-1.5">
                {question.options.map((option) => {
                  const selected = answers[question.id] === option.mode;
                  return (
                    <button
                      key={option.mode + option.label}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.mode }))}
                      className={`w-full rounded-xl px-3 py-2 text-left text-xs font-medium ${
                        selected
                          ? "bg-sky-600 text-white"
                          : "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSkip()}
            className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold dark:border-slate-600"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={!allAnswered || submitting}
            onClick={handleSubmit}
            className="flex-1 rounded-xl bg-[#0b1f3a] py-3 text-sm font-bold text-[#f4c95d] disabled:opacity-50"
          >
            Save my style
          </button>
        </div>
      </div>
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
