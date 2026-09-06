"use client";

import { useState } from "react";
import {
  STRANDED_REASON_OPTIONS,
  type StrandedDisruptionReason,
  type StrandedFlightState,
  type StrandedPrompt,
  ec261EligibleReason,
} from "@/lib/travelAssistant/strandedFlightDetector";
import { Ec261CoachPanel } from "@/components/travelAssistant/Ec261CoachPanel";

export interface StrandedFlightPromptCardProps {
  prompt: StrandedPrompt;
  state: StrandedFlightState | null;
  onConfirmMissed: (reason: StrandedDisruptionReason) => void;
  onDismiss: () => void;
  onForwardRebook: () => void;
  onMadeFlight: () => void;
}

export function StrandedFlightPromptCard({
  prompt,
  state,
  onConfirmMissed,
  onDismiss,
  onForwardRebook,
  onMadeFlight,
}: StrandedFlightPromptCardProps) {
  const [showEc261, setShowEc261] = useState(false);
  const reason = state?.reason;

  if (showEc261 && reason && ec261EligibleReason(reason)) {
    return (
      <Ec261CoachPanel
        reason={reason}
        flightLabel={prompt.flightLabel}
        onBack={() => setShowEc261(false)}
        onForwardRebook={onForwardRebook}
      />
    );
  }

  if (state?.confirmed && reason) {
    return (
      <article
        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10"
        data-testid="stranded-confirmed-card"
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Disruption logged
        </p>
        <h3 className="mt-1 text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
          {prompt.flightLabel}
        </h3>
        <p className="mt-1 text-[15px] text-[#6E6E73] dark:text-[#AEAEB2]">
          Reason: {STRANDED_REASON_OPTIONS.find((o) => o.id === reason)?.label ?? reason}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {ec261EligibleReason(reason) ? (
            <button
              type="button"
              onClick={() => setShowEc261(true)}
              className="min-h-[48px] rounded-xl bg-[#007AFF] px-4 text-[16px] font-semibold text-white"
            >
              Your EC 261 rights & claim steps
            </button>
          ) : null}
          <button
            type="button"
            onClick={onForwardRebook}
            className="min-h-[48px] rounded-xl border border-[#007AFF] px-4 text-[16px] font-semibold text-[#007AFF]"
          >
            Forward new confirmation
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FFF9ED] px-4 py-4 dark:border-amber-500/40 dark:bg-amber-500/10"
      data-testid="stranded-prompt-card"
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#C93400] dark:text-amber-200">
        Still at the airport
      </p>
      <h3 className="mt-1 text-[20px] font-semibold leading-snug text-[#1D1D1F] dark:text-white">
        {prompt.headline}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
        {prompt.subline}
      </p>
      <p className="mt-3 text-[14px] font-medium text-[#1D1D1F] dark:text-white">What happened?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {STRANDED_REASON_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onConfirmMissed(opt.id)}
            className="min-h-[44px] rounded-full border border-[#D1D1D6] bg-white px-4 text-[15px] font-medium text-[#1D1D1F] dark:border-white/20 dark:bg-white/10 dark:text-white"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onMadeFlight}
          className="min-h-[44px] flex-1 text-[15px] font-semibold text-[#007AFF]"
        >
          I made this flight
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] flex-1 text-[15px] font-medium text-[#6E6E73]"
        >
          Not now
        </button>
      </div>
    </article>
  );
}
