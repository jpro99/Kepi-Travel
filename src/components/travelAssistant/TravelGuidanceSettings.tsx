"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useBilling } from "@/lib/billing/BillingContext";
import type { TravelStyleMode, TravelStyleProfile, TravelStyleScores, TravelerGenome } from "@/lib/traveler/types";
import {
  TRAVEL_GUIDANCE_MODES,
  TRAVEL_STYLE_LABELS,
  applyGuidanceMix,
  clearGuidanceMix,
  effectiveDominantMode,
  effectiveStyleScores,
} from "@/lib/travelStyle/travelStyleQuiz";

interface TravelGuidanceSettingsProps {
  genome: TravelerGenome;
  onSave: (next: TravelerGenome) => Promise<void>;
}

function scoresToSliderPercent(scores: TravelStyleScores): Record<TravelStyleMode, number> {
  return {
    quick_board: Math.round(scores.quick_board * 100),
    route_scout: Math.round(scores.route_scout * 100),
    travel_companion: Math.round(scores.travel_companion * 100),
    flight_plan: Math.round(scores.flight_plan * 100),
  };
}

function sliderPercentToScores(pct: Record<TravelStyleMode, number>): TravelStyleScores {
  return {
    quick_board: pct.quick_board,
    route_scout: pct.route_scout,
    travel_companion: pct.travel_companion,
    flight_plan: pct.flight_plan,
  };
}

export function TravelGuidanceSettings({ genome, onSave }: TravelGuidanceSettingsProps) {
  const { hasProAccess } = useBilling();
  const profile = genome.travelStyle;
  const dominant = effectiveDominantMode(profile);
  const effective = effectiveStyleScores(profile);

  const [sliderPct, setSliderPct] = useState<Record<TravelStyleMode, number> | null>(() =>
    effective ? scoresToSliderPercent(effective) : null,
  );
  const [saving, setSaving] = useState(false);

  const previewProfile = useMemo((): TravelStyleProfile | null => {
    if (!profile?.completed || profile.skipped || !sliderPct) return profile ?? null;
    if (!hasProAccess || !profile.mixCustomized) return profile;
    return applyGuidanceMix(profile, sliderPercentToScores(sliderPct));
  }, [profile, sliderPct, hasProAccess]);

  const previewDominant = effectiveDominantMode(previewProfile);

  if (!profile?.completed || profile.skipped) {
    return (
      <div id="travel-guidance" className="mt-8 rounded-lg bg-white p-8 shadow-md">
        <h3 className="text-lg font-medium text-slate-800">Travel guidance</h3>
        <p className="mt-1 text-sm text-slate-500">
          Answer ten quick travel questions so Kepi knows whether you prefer fast, smart, calm, or structured guidance.
        </p>
        <Link
          href="/travel-assistant?retakeTravelStyle=1"
          className="mt-4 inline-block rounded-lg bg-[#0b1f3a] px-4 py-2 text-sm font-semibold text-[#f4c95d]"
        >
          Set up travel guidance
        </Link>
      </div>
    );
  }

  const saveProfile = async (nextStyle: TravelStyleProfile): Promise<void> => {
    setSaving(true);
    try {
      await onSave({ ...genome, travelStyle: nextStyle });
    } finally {
      setSaving(false);
    }
  };

  const handleSliderChange = (mode: TravelStyleMode, value: number): void => {
    if (!profile || !sliderPct) return;
    const next = { ...sliderPct, [mode]: value };
    setSliderPct(next);
    void saveProfile(applyGuidanceMix(profile, sliderPercentToScores(next)));
  };

  const handleResetMix = (): void => {
    if (!profile) return;
    const reset = clearGuidanceMix(profile);
    setSliderPct(scoresToSliderPercent(reset.scores));
    void saveProfile(reset);
  };

  return (
    <div id="travel-guidance" className="mt-8 rounded-lg bg-white p-8 shadow-md">
      <h3 className="text-lg font-medium text-slate-800">Travel guidance</h3>
      <p className="mt-1 text-sm text-slate-500">
        Kepi learned your travel rhythm from your quiz answers. Guidance tone, detail level, and nudges adapt to you.
      </p>

      {previewDominant ? (
        <div className="mt-4 rounded-xl bg-gradient-to-br from-[#0b1f3a] to-sky-900 px-4 py-3 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Primary guidance</p>
          <p className="mt-1 text-lg font-bold">
            {TRAVEL_STYLE_LABELS[previewDominant].emoji} {TRAVEL_STYLE_LABELS[previewDominant].guidanceLabel}
          </p>
          <p className="mt-0.5 text-sm text-slate-200">{TRAVEL_STYLE_LABELS[previewDominant].tagline}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {TRAVEL_GUIDANCE_MODES.map((mode) => {
          const meta = TRAVEL_STYLE_LABELS[mode];
          const active = mode === dominant;
          const pct = effective ? Math.round((effective[mode] ?? 0) * 100) : 0;
          return (
            <div
              key={mode}
              className={`rounded-lg border px-3 py-2 ${active ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50"}`}
            >
              <p className="text-xs font-bold text-slate-800">
                {meta.emoji} {meta.guidanceLabel}
              </p>
              <p className="text-[11px] text-slate-500">{meta.tagline}</p>
              <p className="mt-1 text-[10px] font-semibold text-sky-700">{pct}% match</p>
            </div>
          );
        })}
      </div>

      {hasProAccess && sliderPct ? (
        <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
          <div>
            <p className="text-sm font-semibold text-slate-800">Fine-tune your mix</p>
            <p className="text-xs text-slate-500">Pro — slide toward the guidance feel you want day to day.</p>
          </div>
          {TRAVEL_GUIDANCE_MODES.map((mode) => {
            const meta = TRAVEL_STYLE_LABELS[mode];
            return (
              <label key={mode} className="block">
                <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                  <span>
                    {meta.emoji} {meta.guidanceLabel}
                  </span>
                  <span>{sliderPct[mode]}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={sliderPct[mode]}
                  disabled={saving}
                  onChange={(e) => handleSliderChange(mode, Number(e.target.value))}
                  className="mt-1 w-full accent-sky-600"
                />
              </label>
            );
          })}
          {profile.mixCustomized ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleResetMix}
              className="text-xs font-semibold text-sky-700 underline"
            >
              Reset to quiz results
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-600">
            <span className="font-semibold">Pro:</span> fine-tune guidance with sliders — more fast vs calm vs structured.
          </p>
          <Link href="/travel-assistant?upgrade=pro" className="mt-2 inline-block text-xs font-semibold text-sky-700 underline">
            Upgrade to adjust
          </Link>
        </div>
      )}

      <Link
        href="/travel-assistant?retakeTravelStyle=1"
        className="mt-4 inline-block text-xs font-semibold text-slate-600 underline"
      >
        Retake travel quiz
      </Link>
    </div>
  );
}
