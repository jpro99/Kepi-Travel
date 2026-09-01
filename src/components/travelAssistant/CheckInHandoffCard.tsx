"use client";

import {
  isSafeExternalHttpsUrl,
  type CheckInHandoffContent,
} from "@/lib/travelAssistant/checkInHandoff";

interface CheckInHandoffCardProps {
  content: CheckInHandoffContent;
}

export function CheckInHandoffCard({ content }: CheckInHandoffCardProps) {
  const primaryUrl = isSafeExternalHttpsUrl(content.primaryActionUrl)
    ? content.primaryActionUrl
    : null;
  const secondaryUrl =
    content.secondaryActionUrl && isSafeExternalHttpsUrl(content.secondaryActionUrl)
      ? content.secondaryActionUrl
      : null;

  return (
    <section className="rounded-2xl border border-[#0b1f3a]/20 bg-[#0b1f3a]/5 px-4 py-3 dark:border-sky-400/30 dark:bg-sky-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {content.holdsBoardingPass ? "Boarding pass" : "Check-in open"}
      </p>
      <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{content.headline}</h3>
      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{content.detail}</p>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{content.honestyNote}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {primaryUrl ? (
          <a
            href={primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#007AFF] px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            {content.primaryActionLabel}
          </a>
        ) : null}
        {secondaryUrl && content.secondaryActionLabel ? (
          <a
            href={secondaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {content.secondaryActionLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
