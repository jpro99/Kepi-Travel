"use client";

import {
  buildEc261CoachContent,
  EC261_REGULATION_URL,
  EC261_YOUR_EUROPE_URL,
  type Ec261CompensationBand,
} from "@/lib/travelAssistant/ec261Coach";
import type { StrandedDisruptionReason } from "@/lib/travelAssistant/strandedFlightDetector";

export interface Ec261CoachPanelProps {
  reason: StrandedDisruptionReason;
  flightLabel: string;
  onBack: () => void;
  onForwardRebook: () => void;
}

function BandRow({ band }: { band: Ec261CompensationBand }) {
  return (
    <li className="rounded-xl bg-white/80 px-3 py-2 dark:bg-white/5">
      <p className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white">
        {band.distanceLabel}
      </p>
      <p className="mt-0.5 text-[13px] text-[#6E6E73] dark:text-[#AEAEB2]">
        {band.amountEur != null
          ? `€${band.amountEur} — ${band.articleRef}, Regulation (EC) No 261/2004`
          : `${band.articleRef} — see official regulation for fixed sums`}
      </p>
    </li>
  );
}

export function Ec261CoachPanel({
  reason,
  flightLabel,
  onBack,
  onForwardRebook,
}: Ec261CoachPanelProps) {
  const coach = buildEc261CoachContent(reason);

  return (
    <article
      className="rounded-2xl border border-[#007AFF]/30 bg-[#F0F7FF] px-4 py-4 dark:border-[#007AFF]/40 dark:bg-[#007AFF]/10"
      data-testid="ec261-coach-panel"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-2 min-h-[44px] text-[15px] font-semibold text-[#007AFF]"
      >
        ← Back
      </button>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#007AFF]">EC 261 coach</p>
      <h3 className="mt-1 text-[20px] font-semibold leading-snug text-[#1D1D1F] dark:text-white">
        {coach.headline}
      </h3>
      <p className="mt-1 text-[14px] text-[#6E6E73] dark:text-[#AEAEB2]">{flightLabel}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-[#1D1D1F] dark:text-white">{coach.intro}</p>

      <section className="mt-4">
        <h4 className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white">Care & re-routing</h4>
        <p className="mt-1 text-[14px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
          {coach.careSummary}
        </p>
      </section>

      <section className="mt-4">
        <h4 className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white">Checklist</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
          {coach.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      {coach.reformNotice ? (
        <section className="mt-4 rounded-xl border border-[#007AFF]/20 bg-white/70 px-3 py-3 dark:bg-white/5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#007AFF]">
            Reform update ({coach.reformNotice.statusAsOf})
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
            {coach.reformNotice.summary}
          </p>
          <a
            href={coach.reformNotice.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block min-h-[44px] text-[14px] font-semibold text-[#007AFF]"
          >
            European Parliament press release →
          </a>
        </section>
      ) : null}

      {coach.eligible ? (
        <section className="mt-4">
          <h4 className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white">
            Compensation distance bands (official)
          </h4>
          <ul className="mt-2 space-y-2">
            {coach.compensationBands.map((band) => (
              <BandRow key={band.band} band={band} />
            ))}
          </ul>
          <a
            href={EC261_REGULATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block min-h-[44px] text-[14px] font-semibold text-[#007AFF]"
          >
            Read Regulation (EC) No 261/2004 on EUR-Lex →
          </a>
          <a
            href={EC261_YOUR_EUROPE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block min-h-[44px] text-[14px] font-semibold text-[#007AFF]"
          >
            Your Europe overview →
          </a>
        </section>
      ) : null}

      <section className="mt-4">
        <h4 className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white">
          Extraordinary circumstances
        </h4>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
          {coach.extraordinaryCircumstances}
        </p>
      </section>

      <section className="mt-4 space-y-3">
        {coach.steps.map((step) => (
          <div key={step.id} className="rounded-xl bg-white/80 px-3 py-3 dark:bg-white/5">
            <p className="text-[15px] font-semibold text-[#1D1D1F] dark:text-white">{step.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
              {step.detail}
            </p>
            {step.officialUrl ? (
              <a
                href={step.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block min-h-[44px] text-[14px] font-semibold text-[#007AFF]"
              >
                {step.officialLabel ?? "Official source"} →
              </a>
            ) : null}
          </div>
        ))}
      </section>

      <p className="mt-4 text-[12px] leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
        {coach.disclaimer}
      </p>

      <button
        type="button"
        onClick={onForwardRebook}
        className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#007AFF] text-[16px] font-semibold text-white"
      >
        Forward rebooking confirmation
      </button>
    </article>
  );
}
